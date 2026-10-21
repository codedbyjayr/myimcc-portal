import assert from 'node:assert/strict';
import { once } from 'node:events';
import vm from 'node:vm';
import { get } from 'node:http';
import { server, testUrl } from './test-portal.mjs';

server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const originalDeadline = process.env.TEST_PORTAL_UNTIL;
try {
  delete process.env.TEST_PORTAL_UNTIL;
  assert.equal((await fetch(origin)).status, 503, 'Disabled by default');
  process.env.TEST_PORTAL_UNTIL = new Date(Date.now() - 1000).toISOString();
  assert.equal((await fetch(origin + '/env-config.js')).status, 503, 'Expired portal must not issue config');
  process.env.TEST_PORTAL_UNTIL = new Date(Date.now() + 90000000).toISOString();
  assert.equal((await fetch(origin)).status, 503, 'Maximum activation is 24 hours');
  process.env.TEST_PORTAL_UNTIL = new Date(Date.now() + 3600000).toISOString();
  const config = await (await fetch(origin + '/env-config.js')).text();
  const context = { window: {} };
  vm.runInNewContext(config, context);
  assert.equal(context.window.__ENV__.SUPABASE_URL, testUrl);
  const clientSource = await (await fetch(origin + '/shared/supabase-config.js')).text();
  assert(!clientSource.includes('dusiokpfmkhutptomrqg'));
  assert(clientSource.includes('myimcc-test-auth-token'));
  assert.throws(() => vm.runInNewContext(clientSource, { window: {} }), /Test configuration missing/);
  const calls = [];
  vm.runInNewContext(clientSource, {
    window: { __ENV__: context.window.__ENV__, dispatchEvent() {} },
    setTimeout() {},
    supabase: { createClient(...args) { calls.push(args); return {}; } }, Event: class {},
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], testUrl);
  assert.equal(calls[0][1], context.window.__ENV__.SUPABASE_ANON_KEY);
  assert.equal(calls[0][2].auth.storageKey, 'myimcc-test-auth-token');
  for (const path of ['/', '/auth/login.html']) {
    const page = await (await fetch(origin + path)).text();
    assert(page.includes('signInWithPassword'));
    assert(page.includes('id="email" type="email"'), 'Individual testers must be able to enter their own email');
    assert(page.includes('profile.status !== \'approved\' || profile.is_active !== true'));
    assert(!page.includes('signInWithOAuth'));
    assert(page.includes('actualRole !== requestedRole'), 'A requested role cannot be impersonated');
    assert(page.includes("signOut({scope:'local'})"));
    for (const [, script] of page.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(script);
  }
  assert((await (await fetch(origin + '/student/dashboard.html')).text()).includes('TEST PORTAL'));
  const loginPage = await (await fetch(origin + '/test-login?role=dean')).text();
  const loginScript = [...loginPage.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
  for (const [requested, actual, active, expected] of [
    ['dean','dean',true,true], ['faculty','teacher',true,true],
    ['student','student',true,true], ['admin','admin',true,true],
    ['dean','student',true,false], ['student','student',false,false],
    ['unknown','admin',true,false],
  ]) {
    const elements = Object.fromEntries(['selectedRole','login','submit','message','email','password'].map(id => [id,{value:id}]));
    let submit, redirected = null, signedOut = false;
    elements.login.addEventListener = (event, handler) => { submit = handler; };
    vm.runInNewContext(loginScript, {
      document:{getElementById:id => elements[id]}, URLSearchParams,
      location:{search:'?role=' + requested,assign:path => { redirected = path; }},
      IMCC:{dashboardForRole:role => '/dashboard/' + role},
      supabaseClient:{
        auth:{signInWithPassword:async () => ({data:{user:{id:'test-user'}}}),
          signOut:async () => {signedOut = true;}},
        from:() => ({select:() => ({eq:() => ({single:async () => ({data:{role:actual,status:'approved',is_active:active}})})})}),
      },
    });
    await submit({preventDefault(){}});
    assert.equal(redirected !== null, expected, requested + '/' + actual);
    if (!expected) assert(elements.message.textContent, 'Denied login gives feedback');
    if (requested === 'dean' && actual === 'student') assert(signedOut, 'Role mismatch clears local test session');
  }
  for (const path of ['/.env', '/config/.env', '/scripts/backup-supabase.js', '/supabase/test-environment/schema.sql', '/shared/%2e%2e%2f.env']) {
    assert.equal((await fetch(origin + path)).status, 404, path);
  }
  assert.equal((await fetch(origin, { method: 'POST' })).status, 405);
  const foreignHostStatus = await new Promise((resolve, reject) => {
    get(origin, { headers: { Host: 'attacker.example' } }, response => {
      response.resume(); resolve(response.statusCode);
    }).on('error', reject);
  });
  assert.equal(foreignHostStatus, 403);
  console.log('Test portal: isolation, fail-closed configuration, login routing and file protection passed.');
} finally {
  if (originalDeadline === undefined) delete process.env.TEST_PORTAL_UNTIL;
  else process.env.TEST_PORTAL_UNTIL = originalDeadline;
  await new Promise(resolve => server.close(resolve));
}
