import assert from 'node:assert/strict';
import handler from './developer-preview.js';

const originalFetch = globalThis.fetch;
const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_ANON_KEY;
process.env.SUPABASE_URL = 'https://preview-test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'public-test-key';
const token = aal => 'header.' + Buffer.from(JSON.stringify({ aal })).toString('base64url') + '.signature';
let user, profile, authStatus, profileStatus;
let requests = [];
globalThis.fetch = async (input, options) => {
  const url = String(input);
  assert.equal(options.method, 'GET', 'Preview must never write to Supabase');
  requests.push(url);
  if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify(user), { status: authStatus });
  assert(url.startsWith('https://preview-test.supabase.co/rest/v1/profiles?'));
  assert(url.includes('id=eq.developer-id'));
  return new Response(JSON.stringify(profile), { status: profileStatus });
};

async function request({ method = 'GET', authorization = 'Bearer ' + token('aal2') } = {}) {
  const result = { headers: {}, setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  requests = [];
  await handler({ method, headers: { authorization } }, result);
  assert.equal(result.headers['Cache-Control'], 'no-store');
  return result;
}

try {
  user = { id: 'developer-id', email: 'jlm33405@imcc.edu.ph', email_confirmed_at: '2026-10-20T00:00:00Z' };
  profile = { role: 'admin', status: 'approved', is_active: true };
  authStatus = profileStatus = 200;
  assert.equal((await request()).code, 200);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']) {
    assert.equal((await request({ method })).code, 405);
    assert.equal(requests.length, 0);
  }
  assert.equal((await request({ authorization: '' })).code, 401);
  assert.equal(requests.length, 0);
  delete process.env.SUPABASE_URL;
  assert.equal((await request()).code, 503);
  assert.equal(requests.length, 0);
  process.env.SUPABASE_URL = 'https://preview-test.supabase.co';
  authStatus = 401;
  assert.equal((await request()).code, 401);
  authStatus = 200;
  user.email = 'another-admin@imcc.edu.ph';
  assert.equal((await request()).code, 403);
  assert.equal(requests.length, 1, 'Other admins must not reach the profile query');
  user.email = 'jlm33405@imcc.edu.ph';
  user.email_confirmed_at = null;
  assert.equal((await request()).code, 403);
  user.email_confirmed_at = '2026-10-20T00:00:00Z';
  assert.equal((await request({ authorization: 'Bearer ' + token('aal1') })).code, 403);
  for (const override of [{ role: 'student' }, { status: 'pending' }, { is_active: false }, { is_active: null }]) {
    profile = { role: 'admin', status: 'approved', is_active: true, ...override };
    assert.equal((await request()).code, 403);
  }
  profile = null;
  assert.equal((await request()).code, 403);
  profile = { role: 'admin', status: 'approved', is_active: true };
  profileStatus = 403;
  assert.equal((await request()).code, 403);
  profileStatus = 200;
  const allowed = await request();
  assert.equal(allowed.code, 200);
  assert.deepEqual(Object.keys(allowed.body.dashboards), ['student', 'faculty', 'dean', 'registrar', 'staff', 'admin']);
  assert.deepEqual(Object.keys(allowed.body), ['dashboards'], 'No personal records or credentials in the response');
  console.log('Developer preview: account allowlist, MFA, approval, active role, GET-only access and configuration checks passed.');
} finally {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = originalKey;
}
