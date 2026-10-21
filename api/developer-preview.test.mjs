import assert from 'node:assert/strict';
import handler from './developer-preview.js';

const originalFetch = globalThis.fetch;
const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_ANON_KEY;
process.env.SUPABASE_URL = 'https://preview-test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'public-test-key';
const token = aal => 'header.' + Buffer.from(JSON.stringify({ aal })).toString('base64url') + '.signature';
let user, profile, authStatus, profileStatus, dataStatus = 200;
let requests = [];
globalThis.fetch = async (input, options) => {
  const url = String(input);
  assert.equal(options.method, 'GET', 'Preview must never write to Supabase');
  requests.push(url);
  if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify(user), { status: authStatus });
  const target = new URL(url);
  assert.equal(target.origin, 'https://preview-test.supabase.co', 'Never forward to another host');
  if (target.pathname === '/rest/v1/profiles' && target.searchParams.get('select') === 'role,status,is_active') {
    assert.equal(target.searchParams.get('id'), 'eq.developer-id');
    return new Response(JSON.stringify(profile), { status: profileStatus });
  }
  assert.equal(new Headers(options.headers).get('authorization'), 'Bearer ' + token('aal2'));
  assert.equal(options.redirect, 'error');
  assert.equal(new Headers(options.headers).get('accept-profile'), null);
  if (dataStatus === 500) throw new Error('Database unavailable');
  return new Response(JSON.stringify(dataStatus === 403 ? { message: 'Permission denied' } : [{ id: 42, title: 'Permitted data' }]), {
    status: dataStatus, headers: { 'content-range': '0-0/1', 'content-type': 'application/json' },
  });
};

async function request({ method = 'GET', authorization = 'Bearer ' + token('aal2'), resource, headers = {} } = {}) {
  const result = { headers: {}, setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; } };
  requests = [];
  await handler({ method, url: '/api/developer-preview' + (resource === undefined ? '' : '?resource=' + encodeURIComponent(resource)), headers: { ...headers, authorization } }, result);
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
  assert.deepEqual(allowed.body.user, { id: 'developer-id', email: 'jlm33405@imcc.edu.ph' });
  assert.deepEqual(Object.keys(allowed.body), ['dashboards', 'user'], 'Never return an access token');
  for (const resource of ['/rest/v1/course_offerings?select=*', '/rest/v1/rpc/get_class_roster?p_offering_id=42', '/rest/v1/rpc/list_enrollment_request_history?p_status=pending']) {
    const data = await request({ resource });
    assert.equal(data.code, 200);
    assert.deepEqual(JSON.parse(data.body), [{ id: 42, title: 'Permitted data' }]);
    assert.equal(data.headers['Content-Range'], '0-0/1');
    assert.equal(requests.length, 3, 'Recheck user and profile before each data request');
  }
  for (const resource of ['https://attacker.example/rest/v1/profiles', '//attacker.example/rest/v1/profiles',
    '/auth/v1/user', '/rest/v1/rpc/set_user_role', '/rest/v1/rpc/initialize_student_clearances','/rest/v1/rpc/review_enrollment_request',
    '/rest/v1/../../auth/v1/user', '/rest/v1/%2e%2e/auth/v1/user', '/rest/v1/profiles\\..\\auth']) {
    assert.equal((await request({ resource })).code, 400, resource);
    assert.equal(requests.length, 2, 'Reject invalid targets before forwarding');
  }
  dataStatus = 403;
  assert.equal((await request({ resource: '/rest/v1/profiles?select=*' })).code, 403, 'Keep database permission denials');
  dataStatus = 500;
  assert.equal((await request({ resource: '/rest/v1/profiles?select=*' })).code, 503, 'Fail closed on network errors');
  console.log('Developer view: account/MFA checks, caller JWT, GET-only reads, RPC allowlist, permission errors and target restrictions passed.');
} finally {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = originalKey;
}
