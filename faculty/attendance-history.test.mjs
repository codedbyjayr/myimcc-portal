import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./teacher-dashboard.js',import.meta.url),'utf8');
const start=source.indexOf('    async function loadAttendanceHistory()');
const end=source.indexOf('    // ═',start);
let error=null,data=Array.from({length:8},(_,i)=>({date:`2026-10-${26-i}`,offering_id:1,present:40,absent:0,late:0}));
const body={innerHTML:''},message={style:{}},toasts=[];
const context=vm.createContext({offerings:[{id:1,code:'CLASS'}],getEl:id=>id==='attHistoryBody'?body:message,
  fmtDate:x=>x,escapeHtml:x=>x,showToast:(...args)=>toasts.push(args),
  supabaseClient:{rpc:async(name,args)=>{assert.equal(name,'get_attendance_history');assert.equal(JSON.stringify(args),'{"p_offering_ids":[1]}');return {data,error};}},
});
vm.runInContext(source.slice(start,end),context);
await context.loadAttendanceHistory();
assert.equal((body.innerHTML.match(/<td>40<\/td>/g)||[]).length,8);
const previous=body.innerHTML;
error={message:'Denied'};data=null;
await context.loadAttendanceHistory();
assert.equal(body.innerHTML,previous);
assert(toasts.at(-1)[1]);
error=null;data=[];
await context.loadAttendanceHistory();
assert.equal(body.innerHTML,'');
assert.equal(message.style.display,'block');
console.log('Attendance history: server summaries render complete meetings; failed reads retain results and successful empty reads clear them.');
