import assert from 'node:assert/strict';
import { sealJson } from '../functions/_lib/crypto.js';
import { HttpError } from '../functions/_lib/http.js';
import { requireWhopSession, whopApi } from '../functions/_lib/whop.js';

class FakeStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = String(sql).replace(/\s+/g, ' ').trim();
    this.args = [];
  }
  bind(...args) { this.args = args; return this; }
  async first() {
    const sql = this.sql.toLowerCase();
    if (sql.includes('select * from whop_sessions where admin_session_id = ?')) {
      const row = this.db.sessions.get(String(this.args[0]));
      return row ? { ...row } : null;
    }
    if (sql.includes('select lease_until from whop_refresh_leases where admin_session_id = ?')) {
      const lease = this.db.leases.get(String(this.args[0]));
      return lease ? { lease_until: lease.lease_until } : null;
    }
    throw new Error(`Unsupported fake D1 first(): ${this.sql}`);
  }
  async run() {
    const sql = this.sql.toLowerCase();
    if (sql.startsWith('create table if not exists whop_refresh_leases')) return { meta: { changes: 0 } };
    if (sql.startsWith('delete from whop_refresh_leases where lease_until <= ?')) {
      let changes = 0;
      for (const [sid, lease] of this.db.leases) {
        if (lease.lease_until <= String(this.args[0])) { this.db.leases.delete(sid); changes += 1; }
      }
      return { meta: { changes } };
    }
    if (sql.startsWith('insert or ignore into whop_refresh_leases')) {
      const [sid, lease_token, base_token_version, lease_until, created_at] = this.args;
      if (this.db.leases.has(String(sid))) return { meta: { changes: 0 } };
      this.db.leases.set(String(sid), { lease_token, base_token_version, lease_until, created_at });
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith('delete from whop_refresh_leases where admin_session_id = ? and lease_token = ?')) {
      const [sid, token] = this.args;
      const lease = this.db.leases.get(String(sid));
      if (!lease || lease.lease_token !== token) return { meta: { changes: 0 } };
      this.db.leases.delete(String(sid));
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith('update whop_sessions set access_cipher = ?')) {
      const [access_cipher, refresh_cipher, token_type, scopes, expires_at, updated_at, sid, expectedVersion] = this.args;
      const row = this.db.sessions.get(String(sid));
      if (!row || Number(row.token_version) !== Number(expectedVersion)) return { meta: { changes: 0 } };
      Object.assign(row, {
        access_cipher,
        refresh_cipher,
        token_type,
        scopes,
        expires_at,
        updated_at,
        token_version: Number(row.token_version) + 1,
      });
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith('delete from whop_sessions where admin_session_id = ? and token_version = ?')) {
      const [sid, version] = this.args;
      const row = this.db.sessions.get(String(sid));
      if (!row || Number(row.token_version) !== Number(version)) return { meta: { changes: 0 } };
      this.db.sessions.delete(String(sid));
      return { meta: { changes: 1 } };
    }
    throw new Error(`Unsupported fake D1 run(): ${this.sql}`);
  }
}

class FakeD1 {
  constructor(rows = []) {
    this.sessions = new Map(rows.map((row) => [String(row.admin_session_id), { ...row }]));
    this.leases = new Map();
  }
  prepare(sql) { return new FakeStatement(this, sql); }
}

async function sessionRow(sid, secret, { access = 'access-old', refresh = 'refresh-old', userId = 'user_runtime', tokenVersion = 1 } = {}) {
  const now = new Date().toISOString();
  return {
    admin_session_id: sid,
    access_cipher: await sealJson({ token: access }, secret),
    refresh_cipher: await sealJson({ token: refresh }, secret),
    token_type: 'Bearer',
    scopes: 'openid profile email member:basic:read member:email:read',
    expires_at: new Date(Date.now() - 60_000).toISOString(),
    user_json: JSON.stringify({ sub: userId, id: userId }),
    token_version: tokenVersion,
    created_at: now,
    updated_at: now,
  };
}

const request = new Request('https://sniperplug.com/api/control');
const tokenSecret = 'runtime-resilience-token-secret-2026';
const baseEnv = { WHOP_CLIENT_ID: 'app_runtime_test', WHOP_TOKEN_SECRET: tokenSecret };

// Concurrent refreshes must make exactly one rotating-token request and both callers
// must receive the newly persisted token.
{
  const sid = 'sniperplug-owner';
  const db = new FakeD1([await sessionRow(sid, tokenSecret, { userId: 'user_concurrent' })]);
  const env = { ...baseEnv, SNIPERPLUG_DB: db };
  let refreshCalls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === 'https://api.whop.com/oauth/token') {
      refreshCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 75));
      return new Response(JSON.stringify({
        access_token: 'access-new-concurrent',
        refresh_token: 'refresh-new-concurrent',
        token_type: 'Bearer',
        expires_in: 3600,
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  const admin = { sid, kind: 'owner' };
  const [first, second] = await Promise.all([
    requireWhopSession(request, env, admin),
    requireWhopSession(request, env, admin),
  ]);
  assert.equal(first.accessToken, 'access-new-concurrent');
  assert.equal(second.accessToken, 'access-new-concurrent');
  assert.equal(refreshCalls, 1, 'Concurrent callers spent the rotating refresh token more than once.');
  assert.equal(db.sessions.get(sid)?.token_version, 2);
  assert.equal(db.leases.size, 0, 'Refresh lease was not released.');
}

// Whop content GETs retry bounded 429/5xx responses and honor Retry-After without
// retrying authorization failures.
{
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) return new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '0' } });
    if (calls === 2) return new Response(JSON.stringify({ message: 'upstream unavailable' }), { status: 503, headers: { 'content-type': 'application/json', 'retry-after': '0' } });
    return new Response(JSON.stringify({ data: [{ id: 'exp_ok' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const payload = await whopApi({ accessToken: 'access-content' }, 'experiences');
  assert.equal(payload.data[0].id, 'exp_ok');
  assert.equal(calls, 3);

  calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ message: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } });
  };
  await assert.rejects(
    () => whopApi({ accessToken: 'access-content' }, 'experiences'),
    (error) => error instanceof HttpError && error.status === 403 && error.details?.attempts === 1,
  );
  assert.equal(calls, 1, 'Authorization errors must not be retried.');

  calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ message: 'rate limited' }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '0', 'x-request-id': 'req_runtime' } });
  };
  await assert.rejects(
    () => whopApi({ accessToken: 'access-content' }, 'experiences'),
    (error) => error instanceof HttpError
      && error.status === 503
      && error.details?.whopStatus === 429
      && error.details?.attempts === 3
      && error.details?.requestId === 'req_runtime',
  );
  assert.equal(calls, 3, 'Rate-limit retry count is not bounded.');

  calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ message: 'long rate limit' }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '30' } });
  };
  await assert.rejects(
    () => whopApi({ accessToken: 'access-content' }, 'experiences'),
    (error) => error instanceof HttpError
      && error.status === 503
      && error.details?.retryAfterSeconds === 30
      && error.details?.attempts === 1,
  );
  assert.equal(calls, 1, 'A long Retry-After window must be surfaced instead of retried early.');

  calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: { type: 'rate_limit_exceeded', message: 'Try again in 30 seconds.' } }), { status: 429, headers: { 'content-type': 'application/json' } });
  };
  await assert.rejects(
    () => whopApi({ accessToken: 'access-content' }, 'experiences'),
    (error) => error instanceof HttpError
      && error.status === 503
      && error.details?.retryAfterSeconds === 30
      && error.details?.attempts === 1,
  );
  assert.equal(calls, 1, 'Whop’s rate-limit delay in the error body must be respected.');
}

console.log('\nSNIPERPLUG WHOP RUNTIME RESILIENCE TEST PASSED\n');
console.log('✓ Rotating OAuth refresh tokens are serialized across concurrent workers.');
console.log('✓ Whop content reads retry bounded 429/5xx failures and preserve diagnostics.');
