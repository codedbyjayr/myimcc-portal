import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
const code=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/faq-reindex/index.ts',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,''));
function setup(options={}){
 let handler,reads=0,verified=0;
 vm.runInNewContext(code,{Response,serve:fn=>{handler=fn;},Deno:{env:{get:()=> 'https://project.invalid'}},console:{error(){}},embedFaq:async()=>[],createClient:(_url,key)=>({auth:{admin:{async listUsers(args){verified++;assert.equal(args.perPage,1);if(options.offline)throw Error('offline');return key==='verified-service-key'?{data:{users:[]},error:null}:{data:null,error:{message:'Forbidden'}};}}},from(){reads++;return {select(){return this;},eq(){return this;},is(){return this;},order(){return this;},limit:async()=>({data:[],error:null})};}})});
 return {send:(token,method='POST')=>handler(new Request('https://project.invalid',{method,headers:token?{Authorization:token}:{}})),get reads(){return reads;},get verified(){return verified;}};
}
for(const token of [null,'Basic verified-service-key','Bearer anon','Bearer user-token','Bearer forged-service-role','Bearer verified-service-key extra']){
 const test=setup();assert.equal((await test.send(token)).status,401);assert.equal(test.reads,0,'Denied caller cannot read articles');
}
const offline=setup({offline:true});assert.equal((await offline.send('Bearer verified-service-key')).status,401);assert.equal(offline.reads,0);
const allowed=setup();const response=await allowed.send('Bearer verified-service-key');assert.equal(response.status,200);assert.equal((await response.json()).indexed,0);assert.equal(allowed.verified,1);assert.equal(allowed.reads,1);
assert.equal((await setup().send('Bearer verified-service-key','GET')).status,405);
console.log('FAQ reindex: verified service credentials only; anon/user/forged tokens and verifier failures denied.');
