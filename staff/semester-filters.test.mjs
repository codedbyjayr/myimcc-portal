import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./registrar-dashboard.js',import.meta.url),'utf8');
const nodes={registrarYear:{value:''},offerSubject:{},offerCategory:{value:'ALL'},prospectusBody:{},prospectusEmpty:{classList:{toggle(){}}}};
const current={id:1,code:'CURRENT',title:'Current',year:1,units:3,school_year:'2026-2027',semester:'1st Semester'};
const historical={...current,id:2,code:'HISTORICAL',school_year:'2025-2026',semester:'2nd Semester'};
let written,confirmation;
const context=vm.createContext({document:{},selectedStudent:{id:'student',full_name:'Student'},selectedTerm:'2026-2027|1st Semester',
  allSubjects:[current,historical],allOffers:[{id:'old',student_id:'student',offering_id:2,status:'enrolled',course_offerings:historical}],
  ACTIVE_OFFER_STATUSES:['enrolled'],category:'ALL',getEl:id=>nodes[id],categoryOf:()=> 'GE',
  withBusy:async(_,__,fn)=>fn(),toast(){},console,loadOffers:async()=>{},renderStudentOffers(){},renderDashboardStats(){},
  TABLES:{offers:'enrollments'},supabaseClient:{from(){return {update(payload){written=payload;return this;},eq(){return this;},select(){return this;},single:async()=>({data:{id:'old'},error:null})};}}});
context.window={confirm:message=>{confirmation=message;return true;}};
vm.runInContext(readFileSync(new URL('../shared/identity.js',import.meta.url),'utf8'),context);
vm.runInContext(readFileSync(new URL('../shared/ui.js',import.meta.url),'utf8'),context);
context.html=context.window.UIM.html;
context.IMCC=context.window.IMCC;
for(const [start,end] of [['function offersForStudent()','function renderStudentOffers()'],['function populateOfferSubjects()','async function confirmOffer('],['async function removeOffer(','// ── Messaging']]) {
  vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))),context);
}
assert.equal(vm.runInContext('offersForStudent().length',context),0,'Historical enrollments stay out of the selected term');
vm.runInContext('populateOfferSubjects()',context);
assert(String(nodes.offerSubject.innerHTML).includes('CURRENT'));
assert(!String(nodes.offerSubject.innerHTML).includes('HISTORICAL'));
nodes.registrarYear.value='2';
vm.runInContext('populateOfferSubjects()',context);
assert(!String(nodes.offerSubject.innerHTML).includes('CURRENT'), 'Subject choices respect year level');
nodes.registrarYear.value='1';
vm.runInContext('populateOfferSubjects()',context);
assert(String(nodes.offerSubject.innerHTML).includes('CURRENT'));
nodes.registrarYear.value='';
await context.removeOffer('old',{});
assert.equal(written,undefined,'Hidden historical enrollment cannot be removed through a stale button');
context.selectedTerm='2025-2026|2nd Semester';
await context.removeOffer('old',{});
assert.equal(written.status,'dropped','Removal uses the status accepted by the database');
assert(confirmation.includes('2nd Semester 2025-2026'));
context.selectedTerm='';
vm.runInContext('populateOfferSubjects()',context);
assert(!nodes.offerSubject.innerHTML.includes('value="1"'),'All-terms history cannot assign subjects');
console.log('Registrar semesters: subject choices, historical loads, stale actions and supported removal status passed.');
