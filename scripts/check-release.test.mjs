import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { checkRelease } from './check-release.mjs';
await checkRelease();
const root = await mkdtemp(join(tmpdir(), 'imcc-release-'));
try {
  for (const dir of ['admin','faculty','staff','student','shared','review-assets/shared']) await mkdir(join(root,dir),{recursive:true});
  await writeFile(join(root,'faculty/dean.js'), "client.rpc('list_student_records')");
  await checkRelease(root); // Academic contracts are now promoted to production.
  await writeFile(join(root,'faculty/dean.js'), "client.rpc('get_dean_student_directory')");
  await writeFile(join(root,'review-assets/demo.html'), '<script src="/shared/grading.js"></script>');
  await assert.rejects(checkRelease(root), /production asset/);
  await writeFile(join(root,'review-assets/demo.html'), '<script src="shared/missing.js"></script>');
  await assert.rejects(checkRelease(root), /ENOENT/);
  await writeFile(join(root,'review-assets/shared/grading.js'), "client.rpc('lock_class_grades')");
  await writeFile(join(root,'review-assets/demo.html'), '<script src="shared/grading.js"></script>');
  await checkRelease(root);
  await assert.rejects(checkRelease(root, {VERCEL:'1'}), /configure/);
  const env={VERCEL:'1',SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'public-test-key'};
  await assert.rejects(checkRelease(root,env,async()=>Response.json('older-release')), /semester-v3/);
  await assert.rejects(checkRelease(root,env,async()=>new Response('',{status:503})), /semester-v3/);
  await checkRelease(root,env,async(url,options)=>{
    assert.equal(url.pathname,'/rest/v1/rpc/portal_release_ready');assert.equal(options.headers.apikey,'public-test-key');
    return Response.json('semester-v3');
  });
} finally { await rm(root, {recursive:true,force:true}); }
const context = vm.createContext({document:{currentScript:null}});
vm.runInContext(readFileSync('review-assets/shared/identity.js','utf8'),context);
assert.equal(typeof context.IMCC.fetchAll,'function','Review must ship its own pagination helper');
assert(readFileSync('review-assets/shared/grading.js','utf8').includes('setLocked(value)'));
assert(readFileSync('review-assets/shared/faculty-chrome.js','utf8').includes('loadEnrollmentNotifications:'));
assert(readFileSync('review-assets/shared/supabase-config.js','utf8').startsWith('throw new Error('),'Review assets must reject direct production connections');
const vercel=JSON.parse(readFileSync('vercel.json','utf8'));
assert.equal(vercel.buildCommand,'npm run check:release');
assert(readFileSync('.github/workflows/docker-build.yml','utf8').includes('run: npm run check:release'));
console.log('Release guard: production leaks, crossed/missing assets, review helpers, blocked direct bootstrap and deployment wiring passed.');

assert.equal(vercel.outputDirectory, '.', 'The static portal must publish the repository root after its release check');
