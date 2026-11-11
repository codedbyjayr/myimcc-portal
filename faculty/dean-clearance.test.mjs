import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadDashboardView } from '../scripts/dashboard-markup.mjs';
import '../shared/grading.js';
const source = readFileSync(new URL('./dean-dashboard.js', import.meta.url), 'utf8');
const { ClearanceDetails, StudentPicker, RecordDetails } = await loadDashboardView(new URL('./dean-records-view.tsx', import.meta.url));
const nodes = new Map(), toasts = [], filters = [];
const getEl = id => {
  if (!nodes.has(id)) nodes.set(id, { value: '', handlers: {}, addEventListener(name, fn) { this.handlers[name] = fn; } });
  return nodes.get(id);
};
let saved = { id: 'dean-clearance' }, error = null, writes = 0, confirmApproval = true, release;
const confirmations = [];
const clearances = [
  { id: 'dean-clearance', department_code: 'dean', department_name: 'College Dean', status: 'pending', note: '<script>bad</script>' },
  { id: 'library-clearance', department_code: 'library', department_name: 'Library', status: 'action_required' },
];
const context = vm.createContext({
  state: { profiles: [{ id: 'student', full_name: 'Student' }] }, getEl,
  window: {
    confirm: message => { confirmations.push(message); return confirmApproval; },
    renderDeanClearanceDetails: props => renderToStaticMarkup(createElement(ClearanceDetails, props)),
    renderDeanStudentPicker: props => renderToStaticMarkup(createElement(StudentPicker, props)),
    renderDeanRecordDetails: props => renderToStaticMarkup(createElement(RecordDetails, props)),
  },
  fmtDate: String, showToast: (...args) => toasts.push(args),
  supabaseClient: {
    rpc: async name => { assert.equal(name, 'get_student_record'); return { data: { clearances } }; },
    from: table => {
      assert.equal(table, 'clearances');
      return {
        update(value) { writes++; assert.equal(value.status, 'cleared'); assert(value.cleared_at); return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        is(key, value) { filters.push(['is', key, value]); return this; },
        select(columns) { assert.equal(columns, 'id'); return this; },
        async maybeSingle() {
          if (release === null) await new Promise(resolve => { release = resolve; });
          return { data: saved, error };
        },
      };
    },
  },
});
vm.runInContext(source.slice(source.indexOf('    let selectedRecord'), source.indexOf('    // ══', source.indexOf('    let selectedRecord'))), context);
await context.loadStudentRecord('clearance', 'student');
assert.match(getEl('clearanceDetails').innerHTML, /✓ Clear College Dean requirement/);
assert.equal((getEl('clearanceDetails').innerHTML.match(/data-clearance-id=/g) || []).length, 1);
assert(!getEl('clearanceDetails').innerHTML.includes('<script>'));
assert.match(getEl('clearanceDetails').innerHTML, /Action Required/);
assert.match(getEl('clearanceDetails').innerHTML, /Awaiting student action/);
const button = { dataset: { clearanceId: 'dean-clearance' }, disabled: false };
const event = { target: { closest: () => button } };
const click = getEl('clearanceDetails').handlers.click;
confirmApproval = false;
await click(event);
assert.equal(writes, 0, 'Canceling confirmation does not approve the Dean clearance');
assert.equal(button.disabled, false, 'Canceling leaves approval available');
assert.match(confirmations[0], /College Dean requirement for Student/);
confirmApproval = true;
release = null;
const saving = click(event);
await click(event);
await context.loadStudentRecord('clearance', 'student');
assert.match(getEl('clearanceDetails').innerHTML, /<button[^>]+data-clearance-id="dean-clearance"[^>]+disabled="">Approving…/);
await click({ target: { closest: () => ({ ...button, disabled: false }) } });
release();
await saving;
assert.equal(writes, 1, 'Double clicking and reopening the same record save only once');
assert.deepEqual(filters, [['id', 'dean-clearance'], ['student_id', 'student'], ['department_code', 'dean'], ['status', 'pending']]);
assert.equal(toasts.at(-1)[0], 'College Dean clearance approved.');
error = { message: 'Permission denied' };
await click(event);
assert.equal(toasts.at(-1)[1], true);
assert.equal(button.disabled, false, 'A failed save permits retry');
error = null; saved = null;
await click(event);
assert.match(toasts.at(-1)[0], /No clearance was changed/);
clearances[0].status = null;
await context.loadStudentRecord('clearance', 'student');
await click(event);
assert.deepEqual(filters.at(-1), ['is', 'status', null], 'A legacy null status uses a null condition');
clearances[0].status = 'cleared';
await context.loadStudentRecord('clearance', 'student');
assert(!getEl('clearanceDetails').innerHTML.includes('data-clearance-id='), 'Already cleared requirements have no approval button');
getEl('clearanceCourseFilter').options = [];
context.state.profiles.push(
  { id: 'year-1', role: 'student', full_name: 'Year One', year_level: '1st Year' },
  { id: 'year-2', role: 'student', full_name: 'Year Two', year_level: '2nd Year' },
  { id: 'written-year-2', role: 'student', full_name: 'Written Year Two', year_level: 'Second Year' },
  { id: 'ambiguous-year-2', role: 'student', full_name: 'Year 2 Format', year_level: 'Year 2' },
);
getEl('clearanceYearFilter').value = '1';
context.renderStudentPicker('clearance');
assert.match(getEl('clearanceStudents').innerHTML, /Year One/);
assert.doesNotMatch(getEl('clearanceStudents').innerHTML, /Year Two|Written Year Two|Year 2 Format/, 'Year 1 excludes all year 2 encodings');
getEl('clearanceYearFilter').value = '2';
context.renderStudentPicker('clearance');
assert.match(getEl('clearanceStudents').innerHTML, /Year Two/);
assert.match(getEl('clearanceStudents').innerHTML, /Written Year Two/);
assert.doesNotMatch(getEl('clearanceStudents').innerHTML, /Year One|Year 2 Format/, 'Year 2 excludes other and unrecognized formats');
console.log('Dean clearance: scoped action, safe rendering, verified save, year filtering, and failed-save retry passed.');

context.Grading = globalThis.Grading;
context.renderStudentPicker('record');
assert.match(getEl('recordStudents').innerHTML, /data-student="year-1">Year One/);
const reads = [];
context.supabaseClient.rpc = (name, params) => {
  assert.equal(name, 'get_student_record');
  return new Promise(resolve => reads.push({ id: params.p_student_id, resolve }));
};
const older = context.loadStudentRecord('record', 'year-1');
const other = context.loadStudentRecord('record', 'year-2');
const latest = context.loadStudentRecord('record', 'year-1');
const clearance = context.loadStudentRecord('clearance', 'year-1');
assert.deepEqual(reads.map(read => read.id), ['year-1', 'year-2', 'year-1', 'year-1']);
reads[2].resolve({ data: {
  profile: { id: 'year-1', student_no: 'LATEST' },
  grades: [{ code: 'LEGACY', grade_scale: 'percentage', prelim: 94, final: 94.5, equivalent: 1.25 }],
  billing: null,
} });
await latest;
const currentHtml = getEl('recordDetails').innerHTML;
assert.match(currentHtml, /LATEST/);
assert.match(currentHtml, /<td>94%<\/td>.*<td>94\.5%<\/td><td>1\.25<\/td>/);
assert.match(currentHtml, /No billing summary on file/);
assert.doesNotMatch(currentHtml, /₱0/);
reads[1].resolve({ error: { message: 'Older selection failed' } });
reads[0].resolve({ data: { profile: { id: 'year-1', student_no: 'STALE' } } });
reads[3].resolve({ data: { clearances: [] } });
await Promise.all([older, other, clearance]);
assert.equal(getEl('recordDetails').innerHTML, currentHtml);
assert.equal(getEl('recordDetails').textContent, 'Loading records…', 'Stale errors cannot replace the current record');
assert.match(getEl('clearanceDetails').innerHTML, /No clearance records on file/);
const zero = context.loadStudentRecord('record', 'year-1');
reads[4].resolve({ data: {
  profile: { id: 'year-1' },
  grades: [{ code: 'SCHOOL', grade_scale: 'school', final: 1.5, equivalent: 2.75 }],
  billing: { balance: 0 },
} });
await zero;
assert.match(getEl('recordDetails').innerHTML, /<td>1\.50<\/td><td>2\.75<\/td>/);
assert.match(getEl('recordDetails').innerHTML, /₱0/);
console.log('Dean records: latest selection wins independently, legacy grades keep their scale, and missing and zero balances differ.');
