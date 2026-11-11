import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./dashboard.js',import.meta.url),'utf8');
const start=source.indexOf('function startAcademicUpdates()'),end=source.indexOf('// Wait for shared supabase-config.js',start);
const calls=[];let refresh;
const context={state:{studentProfile:{id:'own-student'},selectedOfferingIds:new Set(['unsaved'])},supabaseClient:{},imccLiveRefresh:(_,tables,fn)=>{assert(tables.filter(t=>t.filter).every(t=>t.filter==='student_id=eq.own-student'));refresh=fn;},getEl:()=>null,document:{querySelector:()=>null},loadEnrollment:async background=>calls.push(['enrollment',background]),loadDashboard:async()=>{},loadGrades:async()=>calls.push(['grades']),loadNotifications:async()=>{},viewProspectus:async()=>calls.push(['prospectus']),showToast(){}};context.window=context;
vm.runInNewContext(source.slice(start,end),context);context.startAcademicUpdates();
await refresh(['enrollment_requests']);assert.equal(calls.length,0,'Unsaved subjects must survive background events');
context.state.selectedOfferingIds.clear();context.state.enrollmentSubmitting=true;await refresh(['enrollments']);assert.equal(calls.length,0,'In-flight submission must not be redrawn');
context.state.enrollmentSubmitting=false;await refresh(['enrollments']);assert.deepEqual(calls,[['enrollment',true]]);
await refresh(['enrollment_terms']);assert.deepEqual(calls,[['enrollment',true],['enrollment',true]],'Term changes refresh enrollment');
await refresh(['grades']);assert.deepEqual(calls.at(-1),['grades']);assert(!calls.some(c=>c[0]==='prospectus'),'Closed prospectus must not reopen');
context.getEl = id => id === 'prospectusModal' ? { open: true } : null;
await refresh(['grades']);
assert.deepEqual(calls.at(-1), ['prospectus'], 'An open prospectus refreshes when grades change');
let notificationRefreshes = 0;
context.loadNotifications = async () => { notificationRefreshes++; };
await refresh(['activities']);
assert.equal(notificationRefreshes,1,'Enrollment opening activities refresh the student notification bell');
console.log('Student updates: own-record filters, unsaved selections, submission guards, targeted grade refresh and closed-modal behavior passed.');

const selectionLine=source.split('\n').find(line=>line.includes('state.selectedOfferingIds = background ?'));
const selectedState={selectedOfferingIds:new Set(['rejected','pending','closed']),courses:[{offering_id:'rejected',enrollmentStatus:'rejected',enrollment_open:true},{offering_id:'pending',enrollmentStatus:'pending',enrollment_open:true},{offering_id:'closed',enrollmentStatus:'rejected',enrollment_open:false}]};
vm.runInNewContext(selectionLine,{state:selectedState,background:true});
assert.deepEqual([...selectedState.selectedOfferingIds],['rejected'],'Retry choices survive a fetch while already submitted subjects are removed');

const list = { innerHTML: '' };
const dot = { textContent: 0, classList: { toggle() {} } };
const storage = new Map();
const query = {
  select() { return this; }, eq() { return this; }, order() { return this; },
  async limit(count) { assert.equal(count, 3); return result; },
};
const failedRead = { error: { message: 'Offline' } };
let result = failedRead;
Object.assign(context, {
  getEl: id => ({ notifList: list, notifDot: dot })[id],
  supabaseClient: { from: () => query },
  localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
  fmtDate: value => value,
  renderStudentNotifications: ({ rows }) => rows?.map(row => row.description).join(',') ?? 'Unavailable',
});
vm.runInContext(source.slice(source.indexOf('async function loadNotifications('), source.indexOf('// ── Enrollment Module')), context);
await context.loadNotifications();
assert.equal(list.innerHTML, 'Unavailable');
result = { data: [{ id: 'one', description: 'Enrollment opened' }] };
await refresh(['activities']);
assert.equal(list.innerHTML, 'Enrollment opened');
assert.equal(dot.textContent, 1);
result = failedRead;
await refresh(['activities']);
assert.equal(list.innerHTML, 'Enrollment opened');
assert.equal(dot.textContent, 1);
context.markBellSeen();
assert.equal(dot.textContent, 0);
