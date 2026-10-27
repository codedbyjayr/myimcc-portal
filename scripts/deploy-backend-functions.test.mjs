import assert from 'node:assert/strict';
import {deployBackendFunctions} from './deploy-backend-functions.mjs';

const env = {SUPABASE_URL:'https://dusiokpfmkhutptomrqg.supabase.co',SUPABASE_ANON_KEY:'public-test-key'};
for (const ready of [false,true]) {
  const calls = [];
  const operation = deployBackendFunctions(env, (command,args) => {calls.push({command,args});return {status:0};}, async()=>new Response(JSON.stringify(ready?'semester-v3':null)));
  if (!ready) {await assert.rejects(operation,/Release blocked/);assert.equal(calls.length,0);}
  else {
    await operation;
    assert.deepEqual(calls.map(c=>c.args[2]),['faq-assistant','faq-reindex']);
    assert(calls.every(c=>c.command==='supabase' && c.args.includes('--no-verify-jwt') && c.args.includes('dusiokpfmkhutptomrqg')));
  }
}
let attempts=0;
await assert.rejects(deployBackendFunctions(env,()=>{attempts++;return {status:1};},async()=>new Response(JSON.stringify('semester-v3'))),/Deployment failed/);
assert.equal(attempts,1,'Stop after the first failed deployment');
await assert.rejects(deployBackendFunctions({...env,SUPABASE_URL:'https://wrong.invalid'}),/intended hosted/);
console.log('Backend deployment: database gate, target project, function order and failure stop passed.');
