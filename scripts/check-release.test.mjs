import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { checkRelease } from './check-release.mjs';

const root = await mkdtemp(join(tmpdir(), 'imcc-release-'));
try {
  await mkdir(join(root, 'review-assets/shared'), { recursive: true });
  await writeFile(join(root, 'review-assets/shared/grading.js'), 'ok');
  await writeFile(join(root, 'review-assets/demo.html'), '<script src="shared/grading.js"></script>');
  await checkRelease({}, undefined, root);
  await writeFile(join(root, 'review-assets/demo.html'), '<script src="/shared/grading.js"></script>');
  await assert.rejects(checkRelease({}, undefined, root), /production asset/);
  await writeFile(join(root, 'review-assets/demo.html'), '<script src="shared/missing.js"></script>');
  await assert.rejects(checkRelease({}, undefined, root), /ENOENT/);
  await writeFile(join(root, 'review-assets/shared/grading.js'), 'ok');
  await writeFile(join(root, 'review-assets/demo.html'), '<script src="shared/grading.js"></script>');
  await assert.rejects(checkRelease({ VERCEL: '1' }, undefined, root), /configure/);

  const env = { VERCEL: '1', SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'public-test-key' };
  for (const [status, body] of [[404, {}], [200, 'older-release'], [200, 'adviser-v1'], [200, 'backend-v2'], [200, 'semester-v3']]) {
    const operation = checkRelease(env, async (url, options) => {
      assert.equal(url.href, 'https://project.supabase.co/rest/v1/rpc/portal_release_ready');
      assert.equal(options.headers.apikey, env.SUPABASE_ANON_KEY);
      assert.equal(options.redirect, 'error');
      return new Response(JSON.stringify(body), { status });
    }, root);
    if (body === 'semester-v3') await operation;
    else await assert.rejects(operation, /Release blocked/);
  }
  await assert.rejects(checkRelease(env, async () => { throw new Error('Network unavailable'); }, root), /Network/);
  await checkRelease();

  const context = vm.createContext({ document: { currentScript: null } });
  vm.runInContext(readFileSync('review-assets/shared/identity.js', 'utf8'), context);
  assert.equal(typeof context.IMCC.fetchAll, 'function', 'Review must ship its own pagination helper');
  assert(readFileSync('review-assets/shared/grading.js', 'utf8').includes('setLocked(value)'));
  assert(readFileSync('review-assets/shared/faculty-chrome.js', 'utf8').includes('loadEnrollmentNotifications:'));
  assert(readFileSync('review-assets/shared/supabase-config.js', 'utf8').startsWith('throw new Error('));
  const vercel = JSON.parse(readFileSync('vercel.json'));
  assert.equal(vercel.buildCommand, 'npm run check:release');
  assert.equal(vercel.outputDirectory, '.');
  assert.equal(vercel.git.deploymentEnabled['codex/backend-semester-release'], false);
  const workflow = readFileSync('.github/workflows/docker-build.yml', 'utf8');
  assert(workflow.includes('run: npm run check:release'));
  assert.match(workflow, /build-and-push:\s*\n\s*if: github\.ref == 'refs\/heads\/main'/);
  for (const [, script] of workflow.matchAll(/run: npm run ([\w:-]+)/g)) {
    assert(JSON.parse(readFileSync('package.json')).scripts[script], `CI calls missing npm script: ${script}`);
  }
  console.log('Release guard: database readiness, review isolation and deployment wiring passed.');
} finally {
  await rm(root, { recursive: true, force: true });
}
