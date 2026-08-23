import { requireAdmin } from '../_lib/auth.js';
import {
  handleError,
  HttpError,
  json,
  methodNotAllowed,
  readJson,
  requireDatabase,
  requireSameOrigin,
} from '../_lib/http.js';


export async function onRequest(context) {
  try {
    const admin = await requireAdmin(context.request, context.env);
    if (!admin?.sid) throw new HttpError(401, 'Unlock the SniperPlug Control Center first.');
    const ownerKey = String(admin.sid);
    if (context.request.method !== 'POST') return methodNotAllowed(['POST']);
    requireSameOrigin(context.request);
    const input = await readJson(context.request, { maxBytes: 20_000 });
    const action = String(input?.action || '').trim();
    const db = requireDatabase(context.env);

    const row = await db.prepare(`
      SELECT * FROM bulk_jobs
      WHERE admin_session_id = ?
      ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, updated_at DESC
      LIMIT 1
    `).bind(ownerKey).first();

    if (!row) return json({ cleared: true, job: null });

    if (action === 'stop') {
      if (row.status !== 'active') return json({ stopped: false, jobId: row.id, status: row.status });
      const now = new Date().toISOString();
      await db.prepare(`
        UPDATE bulk_jobs
        SET status = 'canceled', lease_until = NULL, completed_at = ?, updated_at = ?
        WHERE id = ? AND admin_session_id = ? AND status = 'active'
      `).bind(now, now, row.id, ownerKey).run();
      return json({ stopped: true, jobId: row.id, status: 'canceled' });
    }

    if (action === 'clear') {
      if (row.status === 'active') {
        throw new HttpError(409, 'Stop the active workflow before clearing it. Completed work remains available in recovery and undo history.');
      }
      await db.prepare('DELETE FROM bulk_jobs WHERE id = ? AND admin_session_id = ? AND status != ?')
        .bind(row.id, ownerKey, 'active').run();
      return json({ cleared: true, jobId: row.id });
    }

    throw new HttpError(422, 'Choose stop or clear.');
  } catch (error) {
    return handleError(error);
  }
}
