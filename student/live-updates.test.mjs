import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./dashboard.js',import.meta.url),'utf8');
const start=source.indexOf('function startAcademicUpdates()'),end=source.indexOf('// Wait for shared supabase-config.js',start);
const calls=[];let refresh;const button={textContent:'Submit Enrollment Request'};
const context={state:{studentProfile:{id:'own-student'},selectedOfferingIds:new Set(['unsaved'])},supabaseClient:{},imccLiveRefresh:(_,tables,fn)=>{assert(tables.filter(t=>t.filter).every(t=>t.filter==='student_id=eq.own-student'));refresh=fn;},getEl:id=>id==='confirmEnrollBtn'?button:null,document:{querySelector:()=>null},loadEnrollment:async background=>calls.push(['enrollment',background]),loadDashboard:async()=>{},loadGrades:async()=>calls.push(['grades']),loadNotifications:async()=>{},viewProspectus:async()=>calls.push(['prospectus']),showToast(){}};context.window=context;
vm.runInNewContext(source.slice(start,end),context);context.startAcademicUpdates();
await refresh(['enrollment_requests']);assert.equal(calls.length,0,'Unsaved subjects must survive background events');
context.state.selectedOfferingIds.clear();button.textContent='Submitting…';await refresh(['enrollments']);assert.equal(calls.length,0,'In-flight submission must not be redrawn');
button.textContent='Submit Enrollment Request';await refresh(['enrollments']);assert.deepEqual(calls,[['enrollment',true]]);
await refresh(['grades']);assert.deepEqual(calls.at(-1),['grades']);assert(!calls.some(c=>c[0]==='prospectus'),'Closed prospectus must not reopen');
console.log('Student updates: own-record filters, unsaved selections, submission guards, targeted grade refresh and closed-modal behavior passed.');

const selectionLine=source.split('\n').find(line=>line.includes('state.selectedOfferingIds = background ?'));
const selectedState={selectedOfferingIds:new Set(['rejected','pending','closed']),courses:[{offering_id:'rejected',enrollmentStatus:'rejected',enrollment_open:true},{offering_id:'pending',enrollmentStatus:'pending',enrollment_open:true},{offering_id:'closed',enrollmentStatus:'rejected',enrollment_open:false}]};
vm.runInNewContext(selectionLine,{state:selectedState,background:true});
assert.deepEqual([...selectedState.selectedOfferingIds],['rejected'],'Retry choices survive a fetch while already submitted subjects are removed');
