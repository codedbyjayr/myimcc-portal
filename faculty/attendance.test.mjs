import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('./teacher-dashboard.js',import.meta.url),'utf8');
const code = source.slice(source.indexOf('    let attRoster = []'),source.indexOf('    async function loadAttendanceHistory()'));
const student = id => ({student_id:id,profiles:{id,full_name:id}});
const deferred = () => {let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
function setup(options={}) {
  const controls = Object.fromEntries(['attClassSelect','attDateInput','saveAttendanceBtn','attTable','attBody','noAttMsg'].map(id=>[id,{
    value:id==='attClassSelect'?'1':id==='attDateInput'?'2026-10-26':'',style:{},
    addEventListener(_,fn){this.click=fn;},appendChild(child){this.child=child;},
  }]));
  const writes=[];
  const context=vm.createContext({getEl:id=>controls[id],offerings:[],currentUser:{id:'teacher'},
    SCHOOLTIME:{schoolToday:()=> '2026-10-26'},escapeHtml:x=>x,showToast(){},loadAttendanceHistory(){},
    document:{querySelectorAll:()=>[],createElement:()=>({addEventListener(_,fn){this.click=fn;}})},
    supabaseClient:{rpc:()=>options.roster?options.roster():Promise.resolve({data:[student('a')]}),
      from:()=>({select(){return this;},eq(){return this;},then(resolve,reject){return Promise.resolve(options.read?options.read():{data:[{student_id:'a',status:'absent'}]}).then(resolve,reject);},
        async upsert(rows){writes.push(rows);return options.save?options.save():{};}})},
  });
  vm.runInContext(code+'\nglobalThis.snapshot=()=>JSON.stringify(attRoster);',context);
  return {context,controls,writes};
}
for(const kind of ['attendance','roster','thrown']) {
  let fails=false;
  const test=setup({read:()=>{if(fails&&kind==='thrown')throw new Error('offline');return {data:fails?null:[{student_id:'a',status:'absent'}],error:fails&&kind==='attendance'?{message:'denied'}:null};},
    roster:async()=>({data:[student('a')],error:fails&&kind==='roster'?{message:'denied'}:null})});
  await test.context.loadAttendanceRoster();
  const before=test.context.snapshot();
  fails=true;
  await test.context.loadAttendanceRoster();
  assert.equal(test.context.snapshot(),before);
  assert.equal(test.controls.saveAttendanceBtn.disabled,true);
  await test.controls.saveAttendanceBtn.click();
  assert.equal(test.writes.length,0);
  fails=false;
  await test.controls.noAttMsg.child.click();
  assert.equal(test.controls.saveAttendanceBtn.disabled,false);
  await test.controls.saveAttendanceBtn.click();
  assert.equal(test.writes[0][0].status,'absent');
}
for(const field of ['attClassSelect','attDateInput']) {
  const first=deferred(),second=deferred();let call=0;
  const test=setup({roster:()=> (++call===1?first:second).promise,read:()=>({data:[]})});
  const a=test.context.loadAttendanceRoster();
  test.controls[field].value=field==='attClassSelect'?'2':'2026-10-27';
  const b=test.context.loadAttendanceRoster();
  second.resolve({data:[student('b')]});await b;
  first.resolve({data:[student('a')]});await a;
  await test.controls.saveAttendanceBtn.click();
  assert.equal(test.writes[0][0].student_id,'b');
  assert.equal(test.writes[0][0].offering_id,Number(test.controls.attClassSelect.value));
  assert.equal(test.writes[0][0].date,test.controls.attDateInput.value);
}
const saving=deferred();
const test=setup({save:()=>saving.promise});
await test.context.loadAttendanceRoster();
const operation=test.controls.saveAttendanceBtn.click();
assert.equal(test.controls.attClassSelect.disabled,true);
assert.equal(test.controls.attDateInput.disabled,true);
await test.controls.saveAttendanceBtn.click();
assert.equal(test.writes.length,1);
saving.resolve({error:{message:'write failed'}});await operation;
assert.equal(test.controls.attClassSelect.disabled,false);
assert.equal(test.controls.saveAttendanceBtn.disabled,false);
assert.match(test.context.snapshot(),/absent/);

const dateContext=vm.createContext({Intl,Date:class extends Date{constructor(...args){super(...(args.length?args:['2026-10-26T00:30:00+08:00']));}}});
vm.runInContext(readFileSync(new URL('../shared/datetime.js',import.meta.url),'utf8'),dateContext);
assert.equal(dateContext.SCHOOLTIME.schoolToday(),'2026-10-26');
assert(code.includes('SCHOOLTIME.schoolToday()'));
const html=readFileSync(new URL('./teacher-dashboard.html',import.meta.url),'utf8');
assert(html.indexOf('../shared/datetime.js')<html.indexOf('src="teacher-dashboard.js"'));
console.log('Attendance: read errors, retry, stale class/date responses, duplicate/failed saves, and Manila morning date passed.');
