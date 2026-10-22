import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./dashboard.js',import.meta.url),'utf8');
const start=source.indexOf('let prospectusLoading = false;'),end=source.indexOf('window.viewProspectus',start);
assert(start>=0 && end>start);
for(const failed of ['grades','enrollments',null]){
 const trigger={textContent:'View prospectus',disabled:false};let rendered=0;const errors=[];
 const client={from(table){const result={data:table==='courses'?[{code:'CAP',title:'Capstone',year_level:4,semester:2,units:3}]:[],error:table===failed?{message:'Network unavailable'}:null};const query=new Proxy({}, {get:(_,key)=>key==='then'?(resolve)=>Promise.resolve(result).then(resolve):()=>query});return query;}};
 const context={state:{studentProfile:{id:'student',program:'BSIT'}},supabaseClient:client,getEl:()=>trigger,showToast:text=>errors.push(text),console:{error(){}},Grading:{formatGrade:()=>''},getOrdinalSuffix:x=>x,showProspectusModal:()=>rendered++};
 vm.runInNewContext(source.slice(start,end),context);await context.viewProspectus();
 assert.equal(trigger.disabled,false);assert.equal(trigger.textContent,'View prospectus');assert.equal(rendered,failed?0:1);assert.equal(errors.length,failed?1:0);
}
console.log('Prospectus: grade/enrollment failures never render incomplete completion; retry control restored and successful load passed.');
