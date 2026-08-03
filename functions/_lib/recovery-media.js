import { HttpError } from './http.js';

function safeJson(value, fallback = {}) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(String(value || '')); } catch { return fallback; }
}

export function attachmentFiles(value) {
  const state = safeJson(value, {});
  return Array.isArray(state?.files) ? state.files : [];
}

export function isPermanentR2Media(file) {
  const storageKey = String(file?.storageKey || '').trim();
  const url = String(file?.url || '').trim();
  return file?.durable === true
    && (/^whop-[a-f0-9]{32}-[a-zA-Z0-9._-]{1,120}$/.test(storageKey)
      || /^\/media\/whop-[a-f0-9]{32}-[a-zA-Z0-9._-]{1,120}$/.test(url));
}

export function permanentCourseArchive(value) {
  return attachmentFiles(value).find((file) => {
    const role = String(file?.role || '');
    const type = String(file?.contentType || '').toLowerCase();
    return role === 'hosted-video-archive'
      && isPermanentR2Media(file)
      && (type.startsWith('video/') || type.startsWith('audio/'));
  }) || null;
}

export function recoveryMediaState(row = {}) {
  const attachmentState = safeJson(row.attachment_json || row.attachments, {});
  const files = attachmentFiles(attachmentState);
  const permanentFiles = files.filter(isPermanentR2Media);
  const permanentVideo = permanentCourseArchive(attachmentState);
  const sourceBackedVideo = files.some((file) => {
    const role = String(file?.role || '');
    return file?.sourceBacked === true || ['hosted-video-player', 'hosted-video-download'].includes(role);
  });
  const body = String(row.body_markdown || row.body || '');
  const reviewRequired = Number(attachmentState.reviewCount || 0) > 0
    || /Media review required/i.test(body);

  let mediaState = 'text-only';
  let recoveryNote = 'The saved text can be restored. Re-importing attachments requires the original Whop source.';
  if (permanentVideo) {
    mediaState = 'permanent-video';
    recoveryNote = 'A permanent owner-only R2 video copy exists. This saved copy can be restored without current Whop access.';
  } else if (permanentFiles.length) {
    mediaState = 'permanent-media';
    recoveryNote = 'Permanent owner-only R2 media exists. The saved copy can be restored without current Whop access.';
  } else if (sourceBackedVideo) {
    mediaState = 'live-source-video';
    recoveryNote = 'The imported player depends on current Whop lesson access; no independent video copy is stored.';
  } else if (reviewRequired) {
    mediaState = 'missing-media-copy';
    recoveryNote = 'The text was imported, but flagged private or expiring media was never copied to R2.';
  }

  return {
    mediaState,
    recoveryNote,
    permanentMediaCount: permanentFiles.length,
    permanentVideo: Boolean(permanentVideo),
    sourceBackedVideo,
    reviewRequired,
    canRestoreSavedCopy: permanentFiles.length > 0,
    requiresWhopReimport: permanentFiles.length === 0,
  };
}

export function mediaRepairReview(row = {}) {
  const attachmentState = safeJson(row.attachment_json || row.attachments, {});
  const files = attachmentFiles(attachmentState);
  const truth = recoveryMediaState(row);
  const unresolvedFiles = files.filter((file) => {
    const reason = String(file?.reviewReason || '').trim();
    const url = String(file?.url || '').trim();
    return Boolean(reason) || file?.durable !== true || !url;
  });
  const reasons = [...new Set(unresolvedFiles
    .map((file) => String(file?.reviewReason || '').trim())
    .filter(Boolean))];
  const declaredReviewCount = Math.max(0, Number(attachmentState.reviewCount || 0));
  const reviewCount = Math.max(
    declaredReviewCount,
    unresolvedFiles.length,
    truth.reviewRequired ? 1 : 0,
  );
  return {
    ...truth,
    complete: !truth.reviewRequired,
    reviewCount,
    reasons,
  };
}

export function whopRecoveryError(error, {
  experienceId = null,
  sourceKey = null,
  operation = 'rebuild this import',
} = {}) {
  if (!(error instanceof HttpError)) return error;
  const context = {
    experienceId: experienceId ? String(experienceId) : null,
    sourceKey: sourceKey ? String(sourceKey) : null,
    originalStatus: error.status,
    originalMessage: String(error.message || ''),
  };

  if (error.status === 401) {
    return new HttpError(401, `The saved Whop connection expired. Reconnect Whop before SniperPlug can ${operation}.`, {
      ...context,
      code: 'whop_recovery_reconnect_required',
    });
  }
  if (error.status === 403) {
    return new HttpError(403, `The connected Whop account no longer has permission to ${operation}. The imported text remains private, but media that was never copied to R2 cannot be recovered without source access.`, {
      ...context,
      code: 'whop_recovery_source_access_lost',
    });
  }
  if (error.status === 404) {
    return new HttpError(404, `The original Whop source is no longer available to ${operation}. The imported text remains private, but media that was never copied to R2 cannot be recreated from the saved draft.`, {
      ...context,
      code: 'whop_recovery_source_missing',
    });
  }
  return error;
}
