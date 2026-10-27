import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('./dashboard.js', import.meta.url), 'utf8');
const loader = source.slice(source.indexOf('let enrollmentLoadVersion'), source.indexOf('// Schedule parser'));
for (const failed of ['student_semesters','course_offerings','enrollments','enrollment_requests','enrollment_locks','misc_fees',null]) {
  const alerts = [], nodes = {};
  const current = {school_year:'2026-2027',semester:'1st Semester'};
  const subject = {id:1,code:'ENROLLED',...current,program:'BSIT',year:1,units:3,fee:100,enrollment_open:false};
  const state = {studentProfile:{id:'student',program:'BSIT',year_level:'2nd Year'},courses:[{code:'OLD'}],miscFees:[{amount:999}],selectedOfferingIds:new Set(['old'])};
  const client = {from(table) {
    let offset = 0;
    const data = table==='student_semesters' ? current : table==='course_offerings' ? [subject,{...subject,id:2,code:'OTHER',semester:'2nd Semester',year:2,enrollment_open:true}] : table==='enrollments' ? [{offering_id:1}] : table==='misc_fees' ? [{amount:500}] : [];
    const query = new Proxy({}, {get:(_,key) => key==='then' ? resolve => Promise.resolve({data:offset ? [] : data,error:table===failed ? {message:'Unavailable'} : null}).then(resolve) : (...args) => {if(key==='range') offset=args[0];return query;}});
    return query;
  }};
  const context=vm.createContext({document:{},state,supabaseClient:client,Set,escapeHtml:String,
    getEl:id=>nodes[id]??={style:{},parentElement:{style:{}},querySelectorAll:()=>[],addEventListener(){}},
    showToast:text=>alerts.push(text),setText(){},renderCourseList(){},renderMiscFees(){},renderBillingSummary(){},setEnrollStep(){}});
  vm.runInContext(readFileSync(new URL('../shared/identity.js',import.meta.url),'utf8'),context);
  vm.runInContext(loader,context);
  await vm.runInContext('loadEnrollment()',context);
  if(failed) {
    assert.equal(state.courses[0].code,'OLD',failed+' preserves displayed subjects');
    assert.equal(state.miscFees[0].amount,999,failed+' preserves displayed fees');
    assert(state.selectedOfferingIds.has('old'));
    assert(state.enrollmentReadFailed);
    assert.equal(alerts.length,1);
  } else {
    assert.equal(state.courses.length,1);
    assert.equal(state.courses[0].code,'ENROLLED','Closed subjects remain visible after the student advances a year');
    assert.equal(state.courses[0].enrollmentStatus,'enrolled');
    assert.equal(nodes.enrollmentTerm.value,'2026-2027|1st Semester');
    assert.equal(state.miscFees[0].amount,500);
    await vm.runInContext("loadEnrollment(false,'2026-2027|2nd Semester')",context);
    assert.equal(state.courses[0].code,'OTHER');
    assert.equal(state.courses.length,1,'Switching semesters excludes historical enrollment');
  }
}
console.log('Enrollment terms: closed enrollment, year progression, term switching and all failed reads passed.');
