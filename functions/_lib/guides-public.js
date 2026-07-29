import { publicGuide as readPublicGuide, publicGuides as readPublicGuides } from './guides.js';
import { reconcileImportedGuides } from './import-reconciliation.js';

export async function publicGuide(env, slug) {
  await reconcileImportedGuides(env);
  return readPublicGuide(env, slug);
}

export async function publicGuides(env, input = {}) {
  await reconcileImportedGuides(env);
  return readPublicGuides(env, input);
}
