import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import handler from './env-config.js';
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
assert.equal(vercel.rewrites.find(route => route.source === '/env-config.js')?.destination, '/api/env-config');
const saved = { ...process.env };
try {
  const response = () => ({ headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(code) { this.code=code; return this; }, send(body) { this.body=body; } });
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  let res=response(); handler({},res);
  assert.equal(res.code,503);
  assert(!res.body.includes('dusiokpfmkhutptomrqg'));
  process.env.SUPABASE_URL='https://configured.invalid'; process.env.SUPABASE_ANON_KEY='test-key';
  res=response(); handler({},res);
  const context={window:{}}; vm.runInNewContext(res.body,context);
  assert.equal(context.window.__ENV__.SUPABASE_URL,process.env.SUPABASE_URL);
  assert.equal(res.headers['Cache-Control'],'no-store');
  assert.throws(() => vm.runInNewContext(readFileSync('shared/supabase-config.js','utf8'),{window:{}}),/configuration is missing/);
  console.log('Environment config: explicit settings and fail-closed behavior passed');
} finally {
  for (const key of ['SUPABASE_URL','SUPABASE_ANON_KEY']) saved[key] === undefined ? delete process.env[key] : process.env[key]=saved[key];
}
