import assert from 'node:assert/strict';
import { createAdminSession, OWNER_PRINCIPAL_ID } from '../functions/_lib/auth.js';
import { disconnectPrincipalWhop, principalIdForSession } from '../functions/_lib/whop-connection.js';

const sessionEnv = { SNIPERPLUG_SESSION_SECRET: 'principal-isolation-test-secret-2026' };
const firstLogin = await createAdminSession(sessionEnv);
const secondLogin = await createAdminSession(sessionEnv);

assert.equal(firstLogin.session.principalId, OWNER_PRINCIPAL_ID);
assert.equal(secondLogin.session.principalId, OWNER_PRINCIPAL_ID);
assert.equal(firstLogin.session.sid, OWNER_PRINCIPAL_ID, 'Compatibility storage key must remain the account principal.');
assert.equal(secondLogin.session.sid, OWNER_PRINCIPAL_ID, 'Compatibility storage key must remain the account principal.');
assert.notEqual(firstLogin.session.browserSid, secondLogin.session.browserSid, 'Two browser logins accidentally share one login-session id.');
assert.match(firstLogin.session.browserSid, /^admin_[A-Za-z0-9_-]{16,}$/);
assert.equal(principalIdForSession(firstLogin.session), OWNER_PRINCIPAL_ID);

class FakeStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
    this.args = [];
  }
  bind(...args) {
    this.args = args;
    return this;
  }
  async first() {
    if (this.sql.includes('select * from whop_sessions where admin_session_id = ?')) {
      const row = this.db.sessions.get(String(this.args[0]));
      return row ? { ...row } : null;
    }
    return null;
  }
  async run() {
    const principalId = String(this.args[0] || '');
    if (this.sql.includes('delete from whop_sessions where admin_session_id = ?')) this.db.sessions.delete(principalId);
    if (this.sql.includes('delete from whop_oauth_states where admin_session_id = ?')) this.db.states.delete(principalId);
    if (this.sql.includes('delete from whop_refresh_leases where admin_session_id = ?')) this.db.leases.delete(principalId);
    return { meta: { changes: 1 } };
  }
}

class FakeDatabase {
  constructor() {
    this.sessions = new Map([
      ['acct_a', { admin_session_id: 'acct_a', refresh_cipher: null }],
      ['acct_b', { admin_session_id: 'acct_b', refresh_cipher: null }],
    ]);
    this.states = new Set(['acct_a', 'acct_b']);
    this.leases = new Set(['acct_a', 'acct_b']);
  }
  prepare(sql) {
    return new FakeStatement(this, sql);
  }
}

const db = new FakeDatabase();
await disconnectPrincipalWhop(
  new Request('https://sniperplug.com/api/whop-disconnect', { method: 'POST' }),
  { SNIPERPLUG_DB: db, WHOP_TOKEN_SECRET: 'unused-because-no-refresh-cipher' },
  { principalId: 'acct_a', sid: 'acct_a', browserSid: 'admin_device_a' },
);

assert.equal(db.sessions.has('acct_a'), false, 'Disconnected principal kept its Whop session.');
assert.equal(db.states.has('acct_a'), false, 'Disconnected principal kept its pending OAuth state.');
assert.equal(db.leases.has('acct_a'), false, 'Disconnected principal kept its refresh lease.');
assert.equal(db.sessions.has('acct_b'), true, 'Disconnecting principal A deleted principal B’s Whop session.');
assert.equal(db.states.has('acct_b'), true, 'Disconnecting principal A deleted principal B’s OAuth state.');
assert.equal(db.leases.has('acct_b'), true, 'Disconnecting principal A deleted principal B’s refresh lease.');

assert.throws(
  () => principalIdForSession({}),
  /principal identity/i,
  'Missing principal identity does not fail closed.',
);

console.log('\nWHOP PRINCIPAL ISOLATION REGRESSION PASSED\n');
console.log('✓ Multiple browser sessions can belong to one SniperPlug account without sharing a browser-session id.');
console.log('✓ Whop connection storage remains account-scoped for multi-device use.');
console.log('✓ Disconnecting one principal cannot delete another principal’s Whop session, OAuth state, or refresh lease.');
