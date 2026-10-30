import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('./staff-dashboard.html',import.meta.url),'utf8');
const source=readFileSync(new URL('./staff-dashboard.js',import.meta.url),'utf8');
assert(html.includes('registrar-dashboard.css'),'Use the same layout as Registrar');
assert(!html.includes('enrollment-requests.html'),'Staff navigation is clearance-only');
assert.equal((html.match(/class="nav-item/g)||[]).length,1);
assert.equal(readFileSync(new URL('../review-assets/staff/staff-dashboard.html',import.meta.url),'utf8'),html);
assert.equal(readFileSync(new URL('../review-assets/staff/staff-dashboard.js',import.meta.url),'utf8'),source);
const elements=new Map();
const get=id=>{if(!elements.has(id))elements.set(id,{value:'',set innerHTML(value){this.content=String(value);},get innerHTML(){return this.content||'';},textContent:'',style:{},handlers:{},addEventListener(name,fn){this.handlers[name]=fn;}});return elements.get(id);};
const payload='<img src=x onerror="alert(1)">';
let rows=[{id:'guidance-1',student_id:'student',department_code:'guidance',department_name:'Guidance',note:payload,status:'pending',profiles:{full_name:payload,student_no:'S-1',program:'BSIT',year_level:'4th Year'}},
 {id:'library-1',student_id:'student',department_code:'library',department_name:'Library',status:'pending',profiles:{full_name:payload,year_level:'4th Year'}}];
let error=null,saveError=null,saveRow={id:'guidance-1'},reads=0,filters=[],writes=0,cap=500,failAt=null,confirm=true;
const toasts=[];
const context=vm.createContext({document:{currentScript:null,getElementById:get},window:{confirm:()=>confirm},console,
 client:{rpc:name=>{assert.equal(name,'get_clearance_workspace');return {order(){return this;},async range(from,to){reads++;return {data:rows.slice(from,Math.min(to+1,from+cap)),error:error||(failAt!==null&&from>=failAt?{message:'Later page denied'}:null)};}};},
  from:name=>{assert.equal(name,'clearances');return {update(value){writes++;assert.equal(value.status,'cleared');return this;},eq(key,value){filters.push([key,value]);return this;},select(){return this;},async single(){return {data:saveRow,error:saveError};}};}}
});
context.window=context;
context.confirm=()=>confirm;
vm.runInContext(readFileSync(new URL('../shared/identity.js',import.meta.url),'utf8'),context);
vm.runInContext(readFileSync(new URL('../shared/ui.js',import.meta.url),'utf8'),context);
context.UIM.toast=(...args)=>toasts.push(args);
vm.runInContext(source.replace(/init\(\);\s*$/,''),context);
vm.runInContext("supabaseClient=client; staffProfile={role:'staff',role_department:'Guidance'}; clearanceOffice='guidance'; selectedStudentId='student';",context);
await context.loadClearances();
assert.equal((get('clearanceStudents').innerHTML.match(/data-student-id=/g)||[]).length,1,'One entry per student');
assert(!get('clearanceStudents').innerHTML.includes('<img'));
assert(!get('clearanceDetails').innerHTML.includes('<img'));
assert.match(get('clearanceDetails').innerHTML,/Library/,'Other offices remain visible');
assert.equal((get('clearanceDetails').innerHTML.match(/data-clearance-id=/g)||[]).length,1,'Only Guidance has an action');
get('filterYear').value='1';context.renderStudents();assert(!get('clearanceStudents').innerHTML.includes('data-student-id='));
get('filterYear').value='4';context.renderStudents();assert(get('clearanceStudents').innerHTML.includes('data-student-id='));
const button={disabled:false,dataset:{clearanceId:'guidance-1'}};
confirm=false;await context.approveClearance(button);assert.equal(writes,0);
confirm=true;const saving=context.approveClearance(button);await context.approveClearance(button);await saving;
assert.equal(writes,1,'Double click writes once');
assert.deepEqual(filters,[['id','guidance-1'],['student_id','student'],['department_code','guidance'],['status','pending']]);
await context.approveClearance({disabled:false,dataset:{clearanceId:'library-1'}});assert.equal(writes,1,'Forged Library action is blocked');
saveError={message:'write denied'};const before=reads;await context.approveClearance(button);assert.equal(reads,before);assert.equal(button.disabled,false);
saveError=null;saveRow=null;await context.approveClearance(button);assert.match(toasts.at(-1)[0],/No clearance was changed/);
rows=Array.from({length:1206},(_,id)=>({...rows[0],id:String(id),student_id:String(id)}));cap=137;get('filterYear').value='';
await context.loadClearances();assert.equal((get('clearanceStudents').innerHTML.match(/data-student-id=/g)||[]).length,1206);
failAt=500;await assert.rejects(context.loadClearances(),/Later page denied/);
assert.equal(vm.runInContext('allClearances.length',context),1206,'Partial reload preserves the complete list');
console.log('Staff clearance: clearance-only layout, office actions, safe rendering, year filters, verified saves, double-click protection and pagination passed.');
