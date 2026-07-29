import { quarantineUnsafePublishedGuides } from './content-policy.js';
import { publicGuide as readPublicGuide, publicGuides as readPublicGuides } from './guides.js';

export async function publicGuide(env, slug) {
  await quarantineUnsafePublishedGuides(env);
  return readPublicGuide(env, slug);
}

export async function publicGuides(env, input = {}) {
  await quarantineUnsafePublishedGuides(env);
  return readPublicGuides(env, input);
}
