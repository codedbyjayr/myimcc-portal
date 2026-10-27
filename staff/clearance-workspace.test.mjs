import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('./staff-dashboard.html',import.meta.url),'utf8');
assert(html.indexOf('../env-config.js')<html.indexOf('../shared/supabase-config.js'));
assert(html.indexOf('../shared/ui.js')<html.indexOf('let allClearances'));
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match=>match[1]).find(code=>code.includes('let allClearances'));
const elements=new Map();
const get=id=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',textContent:'',style:{},handlers:{},addEventListener(name,fn){this.handlers[name]=fn;}});return elements.get(id);};
const payload=`<img src=x onerror="alert(1)">'&`;
const row={student_id:payload,department_code:payload,department_name:payload,note:payload,status:'pending',profiles:{full_name:payload,student_no:payload,program:payload}};
let error=null,saveError=null,saveRow={id:'clearance-id'},reads=0,filters=[],rows=[row],cap=500,failAt=null;
const toasts=[];
const context=vm.createContext({document:{currentScript:null,getElementById:get,createElement:()=>({style:{},remove(){}}),body:{appendChild(node){toasts.push(node.textContent);}}},
  confirm:()=>true,setTimeout(){},console:{error(){}},
  client:{rpc:name=>{assert.equal(name,'get_clearance_workspace');return {
    order(column){assert.equal(column,'id');return this;},
    async range(from,to){reads++;return {data:rows.slice(from,Math.min(to+1,from+cap)),error:error||(failAt!==null&&from>=failAt?{message:'Later page denied'}:null)};},
  };},
    from:name=>{assert.equal(name,'clearances');return {update(value){assert.equal(value.status,'cleared');return this;},eq(key,value){filters.push([key,value]);return this;},
      select(columns){assert.equal(columns,'id');return this;},async single(){return {data:saveRow,error:saveError};}};}},
});
vm.runInContext(readFileSync(new URL('../shared/identity.js',import.meta.url),'utf8'),context);
vm.runInContext(readFileSync(new URL('../shared/ui.js',import.meta.url),'utf8'),context);
vm.runInContext(script.replace(/init\(\);\s*$/,''),context);
vm.runInContext('supabaseClient=client;',context);
await context.loadClearances();
const escaped=context.UIM.escapeHtml(payload);
assert(!get('clearanceTable').innerHTML.includes('<img'));
assert(get('clearanceTable').innerHTML.includes(escaped));
assert(get('filterDept').innerHTML.includes(escaped));
assert(!get('clearanceTable').innerHTML.includes('onclick='));
const click=get('clearanceTable').handlers.click;
let saved;
context.clearStudent=(id,department)=>{saved=[id,department];};
click({target:{closest:selector=>{assert.equal(selector,'button[data-student-id]');return {dataset:{studentId:payload,deptCode:payload}};}}});
assert.deepEqual(saved,[payload,payload]);
vm.runInContext(script.slice(script.indexOf('async function clearStudent('),script.indexOf('function showToast(')),context);
await context.clearStudent('student-id','department-code');
assert.deepEqual(filters,[['student_id','student-id'],['department_code','department-code']]);
const previous=get('clearanceTable').innerHTML;
saveError={message:'write denied'};
const before=reads;
await context.clearStudent('student-id','department-code');
assert.equal(reads,before,'Failed save must not pretend the clearance was refreshed');
assert.equal(get('clearanceTable').innerHTML,previous);
saveError=null;saveRow=null;
await context.clearStudent('deleted-student','department-code');
assert.equal(reads,before,'A zero-row save must not report approval or refresh');
assert.match(toasts.at(-1),/No clearance was changed/);

rows=Array.from({length:1206},(_,id)=>({...row,id,status:id%2?'pending':'cleared'}));
cap=137;
await context.loadClearances();
assert.equal(get('totalClr').textContent,1206);
assert.equal(get('clearedCount').textContent,603);
assert.equal(get('pendingCount').textContent,603);
assert.equal((get('clearanceTable').innerHTML.match(/<tr>/g)||[]).length,1206);
failAt=500;
await context.loadClearances();
assert.equal(vm.runInContext('allClearances.length',context),1206,'A partial reload cannot replace the complete list');
failAt=null;
error={message:payload};
await context.loadClearances();
assert(!get('clearanceTable').innerHTML.includes('<img'));
assert(get('clearanceTable').innerHTML.includes(escaped));
console.log('Clearances: safe rendering, verified saves, zero-row rejection, 1,206 rows with lower API caps, and later-page failure passed.');
