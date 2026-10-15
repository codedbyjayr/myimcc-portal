import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const nodes = {};
for (const id of ['back', 'requests', 'message', 'refresh', 'statusFilter']) {
  nodes[id] = { innerHTML: '', textContent: '', addEventListener(event, handler) { this[event] = handler; } };
}
nodes.statusFilter.value = 'pending';
let ready, failure = null;
const calls = [];
const first = { student_id: 'student-a', student_name: '<script>bad</script>', student_no: 'TEST-1', program: 'BSIT', year_level: '1st Year', section: 'TEST-1A', school_year: '2026-2027', semester: '1st Semester', enrolled_units: 3, enrolled_courses: [{ code: 'EXISTING', title: 'Existing subject', units: 3, schedule: 'Wed 11:00-12:30' }] };
let queue = [
  { ...first, status: 'pending', id: 'request', code: 'TEST101', units: 3, schedule: 'Mon 09:00-10:30' },
  { ...first, status: 'pending', id: 'request-2', code: 'TEST102', units: 1.5, schedule: null },
  { ...first, status: 'pending', student_id: 'student-b', id: 'request-3', code: 'OTHER-STUDENT', units: 2 },
  { ...first, status: 'pending', semester: '2nd Semester', id: 'request-4', code: 'OTHER-TERM', units: 3, enrolled_units: 0, enrolled_courses: [] },
];
const context = vm.createContext({
  document: { addEventListener: (_, fn) => { ready = fn; }, getElementById: id => nodes[id] },
  initAuthGuard: async roles => { assert(roles.includes('dean')); return { profile: { role: 'dean' } }; },
  IMCC: { dashboardForRole: () => '/faculty/dean-dashboard.html' },
  prompt: () => 'Missing prerequisite',
  supabaseClient: { rpc: async (name, args) => {
    calls.push({ name, args });
    if (name === 'list_enrollment_request_history') return { data: queue };
    return { error: failure };
  } },
});
context.window = context;
vm.runInContext(readFileSync(new URL('../shared/ui.js', import.meta.url), 'utf8'), context);
vm.runInContext(readFileSync(new URL('./enrollment-requests.js', import.meta.url), 'utf8'), context);
await ready();
assert(nodes.requests.innerHTML.includes('&lt;script&gt;'));
assert(!nodes.requests.innerHTML.includes('<script>'));
assert.equal((nodes.requests.innerHTML.match(/class="student-request"/g) || []).length, 3, 'Separate students and terms; group same student and term');
assert(nodes.requests.innerHTML.includes('4.5 pending units'));
assert(nodes.requests.innerHTML.includes('7.5 units if all pending subjects are approved'));
assert(nodes.requests.innerHTML.includes('BSIT · 1st Year · Section TEST-1A'));
assert(nodes.requests.innerHTML.includes('Mon 09:00-10:30'));
assert(nodes.requests.innerHTML.includes('Schedule TBA'));
assert(nodes.requests.innerHTML.includes('EXISTING — Existing subject'));
assert.equal((nodes.requests.innerHTML.match(/data-decision="approved"/g) || []).length, 4, 'Only pending subjects have action buttons');
const buttons = [{}, {}];
const row = { querySelectorAll: () => buttons };
const button = { dataset: { id: 'request', decision: 'approved' }, closest: () => row };
await nodes.requests.click({ target: { closest: () => button } });
assert.equal(calls[1].name, 'review_enrollment_request');
assert.equal(calls[1].args.p_decision, 'approved');
assert.equal(calls[2].name, 'list_enrollment_request_history');
button.dataset.decision = 'rejected';
failure = { message: 'Access denied' };
await nodes.requests.click({ target: { closest: () => button } });
assert.equal(calls.at(-1).args.p_decision, 'rejected');
assert.equal(calls.at(-1).args.p_review_note, 'Missing prerequisite');
assert(nodes.message.textContent.includes('Access denied'));
assert(buttons.every(b => b.disabled === false));
queue = [{ ...first, id: 'rejected-request', status: 'rejected', review_note: 'Missing prerequisite', code: 'REJECTED101', units: 3 }];
nodes.statusFilter.value = 'rejected';
await nodes.statusFilter.change();
assert(nodes.requests.innerHTML.includes('Missing prerequisite'));
assert(nodes.requests.innerHTML.includes('rejected'));
assert(!nodes.requests.innerHTML.includes('data-decision='), 'History rows cannot be reviewed a second time');
queue = [];
await nodes.refresh.click();
assert.equal(nodes.requests.innerHTML, '');
assert(nodes.message.textContent.startsWith('No rejected requests found.'));
console.log('Enrollment review: student/term grouping, unit totals, escaping, approval, empty state and failure recovery passed');
