import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkRelease } from './check-release.mjs';
await assert.rejects(checkRelease({}), /Release blocked/);
const env = { SUPABASE_URL: 'https://target.invalid', SUPABASE_ANON_KEY: 'public-test-key' };
for (const [status, body] of [[404, {}], [200, 'older-release'], [200, 'adviser-v1'], [200, 'backend-v2'], [200, 'semester-v3']]) {
  const operation = checkRelease(env, async (url, options) => {
    assert.equal(url.href, 'https://target.invalid/rest/v1/rpc/portal_release_ready');
    assert.equal(options.headers.apikey, env.SUPABASE_ANON_KEY);
    assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify(body), { status });
  });
  if (body === 'semester-v3') await operation;
  else await assert.rejects(operation, /Release blocked/);
}
await assert.rejects(checkRelease(env, async () => { throw new Error('Network unavailable'); }), /Network/);
assert.equal(JSON.parse(readFileSync('vercel.json')).git.deploymentEnabled['codex/backend-semester-release'], false, 'Backend branch must not deploy the frontend');
assert(readFileSync('.github/workflows/docker-build.yml', 'utf8').includes('run: npm run check:release'));
assert.match(readFileSync('.github/workflows/docker-build.yml','utf8'), /build-and-push:\s*\n\s*if: github\.ref == 'refs\/heads\/main'/, 'Backend branch must not publish a Docker image');
const pkg = JSON.parse(readFileSync('package.json'));
for (const [, script] of readFileSync('.github/workflows/docker-build.yml','utf8').matchAll(/run: npm run ([\w:-]+)/g)) {
  assert(pkg.scripts[script], `CI calls missing npm script: ${script}`);
}
console.log('Release check: missing config, missing migration, wrong release, network failure and configured target passed.');
