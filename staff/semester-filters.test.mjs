import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadDashboardView } from '../scripts/dashboard-markup.mjs';
const source=readFileSync(new URL('./registrar-dashboard.js',import.meta.url),'utf8');
const view = await loadDashboardView(new URL('./registrar-dashboard-view.tsx', import.meta.url));
const nodes={registrarYear:{value:''},offerSubject:{value:'1'},offerCategory:{value:'ALL'},prospectusSearch:{value:'current'},prospectusSearchField:{value:'code'},prospectusBody:{},prospectusEmpty:{classList:{toggle(){}},hidden:false},studentSearch:{value:'ada'},studentSearchField:{value:'name'},studentBody:{},studentEmpty:{classList:{toggle(){}},hidden:false},offersBody:{},btnAddOffer:{},offerEligibility:{},offerSaveError:{},offerRefreshError:{},offerModal:{close(){}}};
const current={id:1,code:'CURRENT',title:'Anatomy',year:1,units:3,school_year:'2026-2027',semester:'1st Semester'};
const historical={...current,id:2,code:'HISTORICAL',school_year:'2025-2026',semester:'2nd Semester'};
let written, confirmation, eligible = true, reads = 0, rejectedWrite = false;
const context=vm.createContext({document:{},selectedStudent:{id:'student',full_name:'Student',status:'approved',is_active:true},selectedTerm:'2026-2027|1st Semester',
  allSubjects:[current,historical],allStudents:[{id:'student-1',full_name:'Ada Lovelace',student_no:'S-001',year_level:'1st Year',status:'approved',is_active:true}],allOffers:[{id:'old',student_id:'student',offering_id:2,status:'enrolled',course_offerings:historical}],
  ACTIVE_OFFER_STATUSES:['enrolled'],category:'ALL',getEl:id=>nodes[id],categoryOf:()=> 'GE',
  announce(){},setText:(node,value)=>{node.textContent=value;},pluralize:(count,label)=>`${count} ${label}`,categoryBadge:()=>'',
  withBusy:async(_,__,fn)=>fn(),toast(){},console:{...console,warn(){},error(){}},loadOffers:async()=>{throw new Error('Refresh unavailable');},renderDashboardStats(){},
  TABLES:{offers:'enrollments',students:'profiles'},supabaseClient:{from(){return {
    insert(payload){written=payload;return this;},
    update(payload){written=payload;return this;},
    eq(){return this;},select(){return this;},
    async maybeSingle(){reads++;return {data:eligible ? {id:'student'} : null};},
    async single(){return rejectedWrite ? {error:{message:'No matching row'}} : {data:{...written,id:'new'}};}
  };}}});
context.window={confirm:message=>{confirmation=message;return true;}};
for (const name of ['RegistrarStudentRows', 'RegistrarOfferRows', 'RegistrarOfferOptions', 'RegistrarProspectusRows']) {
  context.window['render' + name] = props => renderToStaticMarkup(createElement(view[name], props));
}
vm.runInContext(readFileSync(new URL('../shared/identity.js',import.meta.url),'utf8'),context);
vm.runInContext(readFileSync(new URL('../shared/ui.js',import.meta.url),'utf8'),context);
context.html=context.window.UIM.html;
context.IMCC=context.window.IMCC;
for(const [start,end] of [['async function refreshStudentOffers(', 'async function loadAll()'],['function offersForStudent()','async function publishSummerOffering('],['async function removeOffer(','// ── Messaging']]) {
  vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))),context);
}
vm.runInContext(source.slice(source.indexOf('function renderProspectus()'),source.indexOf('function renderStudents()')),context);
vm.runInContext('renderProspectus()',context);
assert(String(nodes.prospectusBody.innerHTML).includes('CURRENT'),'Prospectus search filters by course code as selected');
nodes.prospectusSearchField.value='title';nodes.prospectusSearch.value='anatomy';
vm.runInContext('renderProspectus()',context);
assert(String(nodes.prospectusBody.innerHTML).includes('Anatomy'),'Prospectus search filters by course title as selected');
nodes.prospectusSearch.value='current';
vm.runInContext('renderProspectus()',context);
assert.equal(nodes.prospectusBody.innerHTML,'','Title-only search excludes code matches');
vm.runInContext(source.slice(source.indexOf('function renderStudents()'),source.indexOf('function selectStudent(')),context);
vm.runInContext('renderStudents()',context);
assert(String(nodes.studentBody.innerHTML).includes('Ada Lovelace'),'Student Offers search filters by name');
nodes.studentSearchField.value='studentNo';nodes.studentSearch.value='s-001';
vm.runInContext('renderStudents()',context);
assert(String(nodes.studentBody.innerHTML).includes('Ada Lovelace'),'Student Offers search filters by student number when selected');
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
rejectedWrite = true;
await context.removeOffer('old',{});
assert.equal(context.offersForStudent().length,1,'A failed removal leaves the existing offer visible');
rejectedWrite = false;
await context.removeOffer('old',{});
assert.equal(written.status,'dropped','Removal uses the status accepted by the database');
assert(confirmation.includes('2nd Semester 2025-2026'));
assert(!nodes.offersBody.innerHTML.includes('HISTORICAL'),'Confirmed removal stays visible even when the refresh fails');
assert.match(nodes.offerRefreshError.textContent,/Change saved.*Refresh offers/);

context.selectedTerm='2026-2027|1st Semester';
written = undefined;
context.selectedStudent.is_active = false;
await context.confirmOffer({});
assert.equal(reads,0,'A locally inactive student cannot submit an offer');
context.selectedStudent.is_active = true;
eligible = false;
await context.confirmOffer({});
assert.equal(reads,1,'Eligibility is checked again at submit');
assert.equal(written,undefined,'A student suspended since loading the roster cannot receive an offer');
assert(nodes.btnAddOffer.disabled);
context.selectedStudent.is_active = true;
eligible = true;
await context.confirmOffer({});
assert.equal(written.offering_id,1);
assert.match(nodes.offersBody.innerHTML,/CURRENT/,'Confirmed assignment stays visible even when the refresh fails');
assert.match(nodes.offerRefreshError.textContent,/Change saved.*Refresh offers/);
written = undefined;
await context.confirmOffer({});
assert.equal(written,undefined,'A stale option cannot submit the same assignment again');
context.selectedTerm='';
vm.runInContext('populateOfferSubjects()',context);
assert(!nodes.offerSubject.innerHTML.includes('value="1"'),'All-terms history cannot assign subjects');
console.log('Registrar semesters: subject choices, historical loads, stale actions and supported removal status passed.');
