import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('./dashboard.js', import.meta.url), 'utf8');
const submit = source.slice(source.indexOf('async function confirmEnrollment()'), source.indexOf('// ── Billing Module'));
const writes = [], toasts = [], steps = [], button = {};
let failure = null;
const context = vm.createContext({
  state: { enrollmentSubmitting: false, enrollmentLocked: false, enrollmentReadFailed: false, enrollmentComplete: false, studentProfile: { id: 'student' }, selectedOfferingIds: new Set(['12', '13']), courses: [{ offering_id: '12', units: 3 }, { offering_id: '13', units: 2 }] },
  getEl: () => button,
  supabaseClient: { from: table => ({ insert: async rows => { writes.push({ table, rows }); return { error: failure }; } }) },
  setEnrollStep: n => steps.push(n), showToast: (...args) => toasts.push(args),
  setText: (id, text) => { button.summary = text; },
  loadDashboard: async () => {}, loadEnrollment: async () => {},
});
vm.runInContext(submit, context);
vm.runInContext(source.slice(source.indexOf('function renderEnrollmentSummary()'), source.indexOf('function setEnrollStep(step)')), context);
let enrollNow;
button.addEventListener = (event, handler) => { assert.equal(event, 'click'); enrollNow = handler; };
vm.runInContext(source.split('\n').find(line => line.includes("getEl('proceedBtn')?.addEventListener")), context);
vm.runInContext('renderEnrollmentSummary()', context);
assert.equal(button.summary, '5 units · 2 subjects');
assert.equal(button.disabled, false);
await enrollNow();
assert.equal(writes[0].table, 'enrollment_requests');
assert.equal(writes[0].rows.length, 2);
assert(writes[0].rows.every(r => r.student_id === 'student' && r.status === 'pending'));
assert.deepEqual(steps, [2]);
context.state.selectedOfferingIds.clear();
await vm.runInContext('confirmEnrollment()', context);
assert.equal(writes.length, 1, 'Empty selection must not submit');
vm.runInContext('renderEnrollmentSummary()', context);
assert.equal(button.disabled, true, 'Empty selection disables Enroll Now');
context.state.selectedOfferingIds.add('12');
for (const guard of ['enrollmentLocked', 'enrollmentReadFailed']) {
  context.state[guard] = true;
  await enrollNow();
  assert.equal(writes.length, 1, guard + ' prevents submission');
  context.state[guard] = false;
}
context.state.enrollmentComplete = true;
await vm.runInContext('confirmEnrollment()', context);
assert.equal(writes.length, 1, 'An enrolled student cannot submit again');
context.state.enrollmentComplete = false;
context.state.enrollmentSubmitting = true;
await vm.runInContext('confirmEnrollment()', context);
assert.equal(writes.length, 1, 'A double click cannot submit a second request');
context.state.enrollmentSubmitting = false;
failure = { message: 'Request denied' };
await vm.runInContext('confirmEnrollment()', context);
assert.deepEqual(steps, [2], 'Failure must not show success');
assert.equal(button.disabled, false);
assert.equal(context.state.enrollmentSubmitting, false, 'Failed submission allows retry');
assert.equal(button.textContent, 'Enroll Now →');
assert.equal(toasts.at(-1)[1], true);
console.log('Enrollment submission: pending requests, empty selection, and error handling passed');
