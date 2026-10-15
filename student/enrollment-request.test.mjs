import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('./dashboard.js', import.meta.url), 'utf8');
const submit = source.slice(source.indexOf('async function confirmEnrollment()'), source.indexOf('// ── Billing Module'));
const writes = [], toasts = [], steps = [], button = {};
let failure = null;
const context = vm.createContext({
  state: { studentProfile: { id: 'student' }, selectedOfferingIds: new Set(['12', '13']) },
  getEl: () => button,
  supabaseClient: { from: table => ({ insert: async rows => { writes.push({ table, rows }); return { error: failure }; } }) },
  setEnrollStep: n => steps.push(n), showToast: (...args) => toasts.push(args),
  loadDashboard: async () => {}, loadEnrollment: async () => {},
});
vm.runInContext(submit, context);
await vm.runInContext('confirmEnrollment()', context);
assert.equal(writes[0].table, 'enrollment_requests');
assert.equal(writes[0].rows.length, 2);
assert(writes[0].rows.every(r => r.student_id === 'student' && r.status === 'pending'));
assert.deepEqual(steps, [3]);
context.state.selectedOfferingIds.clear();
await vm.runInContext('confirmEnrollment()', context);
assert.equal(writes.length, 1, 'Empty selection must not submit');
context.state.selectedOfferingIds.add('12');
failure = { message: 'Request denied' };
await vm.runInContext('confirmEnrollment()', context);
assert.deepEqual(steps, [3], 'Failure must not show success');
assert.equal(button.disabled, false);
assert.equal(toasts.at(-1)[1], true);
console.log('Enrollment submission: pending requests, empty selection, and error handling passed');
