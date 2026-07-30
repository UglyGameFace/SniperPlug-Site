import { whopContentToMarkdown } from './content-policy.js';
import { HttpError } from './http.js';
import { resolveWhopExperienceType, sourceKeyForWhopItem, whopApi } from './whop.js';

const PAGE_SIZE = 50;
const MAX_PAGES = 100;
const MAX_ITEMS = 2000;

function cleanTitle(value, fallback = 'Untitled Whop content') {
  return String(value || fallback).normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 140) || fallback;
}

function firstLine(value, fallback) {
  const text = String(value || '').trim().split(/\n+/)[0]?.replace(/\s+/g, ' ') || '';
  return cleanTitle(text.slice(0, 110), fallback);
}

function fileInput(file, role = 'attachment') {
  if (!file || typeof file !== 'object') return null;
  const id = String(file.id || '').trim();
  const url = /^https:\/\//i.test(String(file.url || file.source_url || file.optimized_url || ''))
    ? String(file.url || file.source_url || file.optimized_url)
    : null;
  if (!id && !url) return null;
  return {
    id,
    filename: String(file.filename || `${role.replace(/-/g, ' ')} file`).trim().slice(0, 180),
    content_type: String(file.content_type || '').trim().slice(0, 120),
    url,
    visibility: String(file.visibility || '').trim().toLowerCase() || null,
    upload_status: String(file.upload_status || '').trim().toLowerCase() || null,
    role,
  };
}

async function allPages(session, path, query = {}, maxItems = MAX_ITEMS) {
  const values = [];
  let after = '';
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload = await whopApi(session, path, {
      ...query,
      first: PAGE_SIZE,
      ...(after ? { after } : {}),
    });
    const data = Array.isArray(payload?.data) ? payload.data : [];
    values.push(...data);
    if (values.length > maxItems) throw new HttpError(422, `Whop returned more than ${maxItems} items for one source.`);
    if (!payload?.page_info?.has_next_page) return values;
    const next = String(payload?.page_info?.end_cursor || '');
    if (!next || next === after) throw new HttpError(502, 'Whop returned an invalid pagination cursor.');
    after = next;
  }
  throw new HttpError(502, 'Whop pagination exceeded the safe page limit.');
}

function sourceContext(experience) {
  return {
    experienceTitle: String(experience?.name || '').trim() || null,
    companyTitle: String(experience?.company?.title || '').trim() || null,
  };
}

function forumItem(post, experience) {
  return {
    sourceType: 'forum',
    id: String(post?.id || ''),
    title: cleanTitle(post?.title, firstLine(post?.content, 'Whop forum post')),
    content: post?.content || '',
    user: post?.user || null,
    attachments: (Array.isArray(post?.attachments) ? post.attachments : []).map((file) => fileInput(file, 'forum-attachment')).filter(Boolean),
    created_at: post?.created_at || null,
    updated_at: post?.updated_at || post?.created_at || null,
    sourceMeta: {
      ...sourceContext(experience),
      pinned: Boolean(post?.is_pinned),
      edited: Boolean(post?.is_edited),
      posterAdmin: Boolean(post?.is_poster_admin),
      parentId: post?.parent_id || null,
    },
  };
}

function courseLessonContent(lesson, course) {
  const parts = [];
  const renderedContent = whopContentToMarkdown(lesson?.content || '');
  if (renderedContent) parts.push(renderedContent);
  if (lesson?.embed_type === 'youtube' && lesson?.embed_id) {
    parts.push(`## Video\n\n[Watch on YouTube](https://www.youtube.com/watch?v=${encodeURIComponent(String(lesson.embed_id))})`);
  } else if (lesson?.embed_type === 'loom' && lesson?.embed_id) {
    parts.push(`## Video\n\n[Watch on Loom](https://www.loom.com/share/${encodeURIComponent(String(lesson.embed_id))})`);
  }
  if (Array.isArray(lesson?.assessment_questions) && lesson.assessment_questions.length) {
    const questions = lesson.assessment_questions.map((question, index) => {
      const options = Array.isArray(question?.options) && question.options.length
        ? `\n${question.options.map((option) => `- ${String(option?.option_text || '').trim()}`).join('\n')}`
        : '';
      return `### ${index + 1}. ${String(question?.question_text || 'Question').trim()}${options}`;
    });
    parts.push(`## Knowledge check\n\n${questions.join('\n\n')}`);
  }
  if (!parts.length && course?.title) parts.push(`Course lesson from ${cleanTitle(course.title, 'Whop course')}.`);
  return parts.join('\n\n');
}

function courseAttachments(lesson) {
  const values = [];
  const mainPdf = fileInput(lesson?.main_pdf, 'main-pdf');
  if (mainPdf) values.push(mainPdf);
  for (const attachment of Array.isArray(lesson?.attachments) ? lesson.attachments : []) {
    const file = fileInput(attachment, 'attachment');
    if (file) values.push(file);
  }
  if (lesson?.video_asset) {
    values.push({
      id: String(lesson.video_asset.id || ''),
      filename: `${cleanTitle(lesson.title, 'Course lesson')} hosted video`,
      content_type: lesson.video_asset.audio_only ? 'audio/mpeg' : 'video/mp4',
      url: null,
      visibility: 'private',
      upload_status: String(lesson.video_asset.status || 'unknown'),
      role: 'hosted-video',
      reviewReason: 'Whop-hosted course video requires permanent SniperPlug media storage before publication.',
    });
  }
  return values;
}

function courseItem(lesson, course, experience, { detailDeferred = false } = {}) {
  const mediaContext = detailDeferred ? null : {
    lessonId: String(lesson?.id || ''),
    title: cleanTitle(lesson?.title, course?.title || 'Course lesson'),
    thumbnail: lesson?.thumbnail || null,
    videoAsset: lesson?.video_asset || null,
  };
  return {
    sourceType: 'course',
    id: String(lesson?.id || ''),
    title: cleanTitle(lesson?.title, course?.title || 'Course lesson'),
    content: courseLessonContent(lesson, course),
    user: null,
    attachments: courseAttachments(lesson),
    created_at: lesson?.created_at || course?.created_at || null,
    updated_at: lesson?.updated_at || lesson?.created_at || course?.updated_at || null,
    _mediaContext: mediaContext,
    sourceMeta: {
      ...sourceContext(experience),
      courseId: course?.id || lesson?.course?.id || null,
      courseTitle: course?.title || lesson?.course?.title || null,
      chapterId: lesson?.chapter?.id || null,
      lessonType: lesson?.lesson_type || null,
      visibility: lesson?.visibility || null,
      order: lesson?.order ?? null,
      detailDeferred,
    },
  };
}

function chatContent(message) {
  const parts = [];
  if (message?.content && String(message.content).trim()) parts.push(message.content);
  if (message?.poll?.options?.length) parts.push(`## Poll\n\n${message.poll.options.map((option) => `- ${String(option?.text || '').trim()}`).join('\n')}`);
  return parts.length === 1 ? parts[0] : parts.join('\n\n') || `[${String(message?.message_type || 'Chat message').replace(/_/g, ' ')}]`;
}

function chatItem(message, experience) {
  return {
    sourceType: 'chat',
    id: String(message?.id || ''),
    title: message?.is_pinned
      ? `Pinned · ${firstLine(message?.content, 'Chat message')}`
      : firstLine(message?.content, `Chat message ${String(message?.id || '').slice(-8)}`),
    content: chatContent(message),
    user: message?.user || null,
    attachments: (Array.isArray(message?.attachments) ? message.attachments : []).map((file) => fileInput(file, 'chat-attachment')).filter(Boolean),
    created_at: message?.created_at || null,
    updated_at: message?.updated_at || message?.created_at || null,
    sourceMeta: {
      ...sourceContext(experience),
      pinned: Boolean(message?.is_pinned),
      edited: Boolean(message?.is_edited),
      messageType: message?.message_type || null,
      replyingTo: message?.replying_to_message_id || null,
      viewCount: Number(message?.view_count || 0),
    },
  };
}

export async function listExperienceItemsLite(session, experience) {
  const type = await resolveWhopExperienceType(session, experience);
  if (type === 'forum') {
    const posts = await allPages(session, 'forum_posts', { experience_id: experience.id });
    return posts.filter((post) => !post?.parent_id).map((post) => forumItem(post, experience)).filter((item) => item.id);
  }
  if (type === 'course') {
    const courses = await allPages(session, 'courses', { experience_id: experience.id }, 250);
    const output = [];
    for (const course of courses) {
      const lessons = await allPages(session, 'course_lessons', { course_id: course.id });
      for (const lesson of lessons) output.push(courseItem(lesson, course, experience, { detailDeferred: true }));
    }
    return output.filter((item) => item.id);
  }
  if (type === 'chat') {
    const messages = await allPages(session, 'messages', { channel_id: experience.id, direction: 'asc' });
    return messages.map((message) => chatItem(message, experience)).filter((item) => item.id && !item.sourceMeta.replyingTo);
  }
  throw new HttpError(422, 'Whop’s official Course, Forum, and Chat endpoints returned no readable items for this app-specific module. A publisher-documented app API is required.');
}

function idFromSourceKey(sourceKey, expectedPrefix) {
  const value = String(sourceKey || '');
  if (!value.startsWith(expectedPrefix)) throw new HttpError(422, 'The saved content ID does not match this Whop source type.');
  const id = value.slice(expectedPrefix.length).trim();
  if (!id) throw new HttpError(422, 'The saved Whop content ID is incomplete.');
  return id;
}

export async function retrieveExperienceItem(session, experience, sourceKey) {
  const type = await resolveWhopExperienceType(session, experience);
  if (type === 'forum') {
    const id = idFromSourceKey(sourceKey, 'forum-post:');
    return forumItem(await whopApi(session, `forum_posts/${encodeURIComponent(id)}`), experience);
  }
  if (type === 'course') {
    const id = idFromSourceKey(sourceKey, 'course-lesson:');
    const lesson = await whopApi(session, `course_lessons/${encodeURIComponent(id)}`);
    return courseItem(lesson, lesson?.course || null, experience, { detailDeferred: false });
  }
  if (type === 'chat') {
    const id = idFromSourceKey(sourceKey, 'chat-message:');
    return chatItem(await whopApi(session, `messages/${encodeURIComponent(id)}`), experience);
  }
  throw new HttpError(422, 'This app-specific source does not expose an exact item through Whop’s official Course, Forum, or Chat APIs.');
}

export { sourceKeyForWhopItem };
