import assert from 'node:assert/strict';
import { executeEnrollmentAction, groupEnrollmentRequests, loadEnrollmentWorkspace } from './enrollment-workspace.ts';

const first = { student_id: 'student-a', student_name: '<script>bad</script>', student_no: 'TEST-1', school_year: '2026-2027', semester: '1st Semester', enrolled_units: 3 };
const requests = [
  { ...first, id: 'request-1', status: 'pending', units: 3 },
  { ...first, id: 'request-2', status: 'pending', units: 1.5 },
  { ...first, id: 'request-3', student_id: 'student-b', status: 'pending', units: 2 },
  { ...first, id: 'request-4', semester: '2nd Semester', status: 'pending', units: 3 },
];
const groups = groupEnrollmentRequests(requests);
assert.equal(groups.length, 3, 'Group by student, school year, and semester');
assert.equal(groups[0].length, 2);
assert.equal(groups[0].reduce((total, request) => total + Number(request.units), 0), 4.5);
assert.equal(groups[0][0].student_name, '<script>bad</script>', 'Data stays as plain text for React to escape');

let history = requests, workspace = { groups: [], terms: [] }, failedRpc = '';
const calls = [];
const client = { async rpc(name, args) {
  calls.push({ name, args });
  if (name === failedRpc) return { error: { message: 'Access denied' } };
  if (name === 'list_enrollment_request_history') return { data: history };
  if (name === 'get_enrollment_workspace') return { data: workspace };
  return { error: null };
} };
assert.deepEqual(await loadEnrollmentWorkspace(client, 'pending'), { status: 'pending', requests, groups: [], terms: [] });
assert.equal(calls[0].args.p_status, 'pending');
failedRpc = 'list_enrollment_request_history';
await assert.rejects(loadEnrollmentWorkspace(client, 'all'), /Access denied/);
failedRpc = 'get_enrollment_workspace';
await assert.rejects(loadEnrollmentWorkspace(client, 'all'), /Access denied/, 'A successful history read cannot publish a partial workspace');
const beforePreview = calls.length;
assert.deepEqual(await loadEnrollmentWorkspace(client, 'all', true), { status: 'all', requests, groups: [], terms: [] });
assert.deepEqual(calls.slice(beforePreview).map(call => call.name), ['list_enrollment_request_history']);
failedRpc = '';
workspace = null;
await assert.rejects(loadEnrollmentWorkspace(client, 'all'), /Invalid enrollment workspace/);
workspace = { groups: [], terms: [] };
history = null;
assert.deepEqual((await loadEnrollmentWorkspace(client, 'all')).requests, []);

const approval = { kind: 'review', request: requests[0], decision: 'approved' };
await executeEnrollmentAction(client, approval, 'Ignored for approvals');
assert.deepEqual(calls.at(-1), { name: 'review_enrollment_request', args: { p_request_id: 'request-1', p_decision: 'approved', p_review_note: null } });
const rejection = { ...approval, decision: 'rejected' };
const beforeInvalid = calls.length;
await assert.rejects(executeEnrollmentAction(client, rejection, '   '), /rejection reason is required/);
await assert.rejects(executeEnrollmentAction(client, rejection, 'x'.repeat(1001)), /1,000 characters/);
assert.equal(calls.length, beforeInvalid, 'Invalid reasons never reach the database');
await executeEnrollmentAction(client, rejection, '  Missing prerequisite  ');
assert.equal(calls.at(-1).args.p_review_note, 'Missing prerequisite');
failedRpc = 'review_enrollment_request';
await assert.rejects(executeEnrollmentAction(client, approval), /Access denied/);
failedRpc = '';
await executeEnrollmentAction(client, { kind: 'finalize', group: first });
assert.deepEqual(calls.at(-1), { name: 'finalize_enrollment', args: { p_student_id: 'student-a', p_school_year: '2026-2027', p_semester: '1st Semester' } });
for (const semester of ['1st Semester', '2nd Semester', 'Summer']) {
  for (const open of [true, false]) {
    await executeEnrollmentAction(client, { kind: 'term', term: { school_year: '2026-2027', semester }, open });
    assert.deepEqual(calls.at(-1), { name: 'set_enrollment_term', args: { p_school_year: '2026-2027', p_semester: semester, p_open: open } });
  }
}
failedRpc = 'set_enrollment_term';
await assert.rejects(executeEnrollmentAction(client, { kind: 'term', term: { school_year: '2026-2027', semester: 'Summer' }, open: true }), /Access denied/);
failedRpc = 'finalize_enrollment';
await assert.rejects(executeEnrollmentAction(client, { kind: 'finalize', group: first }), /Access denied/);
console.log('Enrollment data: student/term grouping, complete snapshots, rejection validation, scoped decisions, finalization, all three terms, and failed writes passed.');
