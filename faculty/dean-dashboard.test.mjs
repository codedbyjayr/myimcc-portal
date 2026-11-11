import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadDashboardView } from '../scripts/dashboard-markup.mjs';
const source = readFileSync(new URL('./dean-dashboard.js', import.meta.url), 'utf8');
const { InstructorField, offeringFields } = await loadDashboardView(new URL('./dean-schedule-view.tsx', import.meta.url));
const nodes = new Map(), calls = [], toasts = [];
let save, error = null, closeCount = 0;
const values = { code: 'SUM101', title: 'Summer Subject', units: '3', program: 'BSIT', year: '1', semester: 'Summer', school_year: '2026-2027', schedule: '', instructor_id: '' };
for (const [key, value] of Object.entries(values)) nodes.set('field_' + key, { value, closest() {}, focus() {} });
nodes.get('field_instructor_id').selectedOptions = [];
nodes.set('modalSaveBtn', { textContent: 'Save', addEventListener(_, handler) { save = handler; } });
nodes.set('instructorSelectWrapper', { innerHTML: '' });
const state = { instructorOptions: [], instructorOptionsError: null };
const context = vm.createContext({
  state, currentUserId: 'dean', editingOfferingId: null, offeringModalOpen: true, modalVersion: 0,
  getEl: id => nodes.get(id), escapeHtml: value => String(value).replaceAll('<', '&lt;'),
  showToast: (...args) => toasts.push(args), closeModal() { closeCount++; }, console,
  window: { deanOfferingFields: offeringFields, renderDeanInstructorField: props => renderToStaticMarkup(createElement(InstructorField, props)) },
  IMCC: { fetchAll: async () => ({ data: [] }) }, renderFacultyPage() {}, loadMyClasses() {},
  supabaseClient: { rpc: async (name, payload) => { calls.push({ name, payload }); return { data: { id: 1 }, error }; } },
});
vm.runInContext(source.slice(source.indexOf('    function renderInstructorDropdown('), source.indexOf('    function openModal(')), context);
vm.runInContext('renderInstructorDropdown()', context);
assert(nodes.get('instructorSelectWrapper').innerHTML.includes('Unassigned'));
assert(!nodes.get('instructorSelectWrapper').innerHTML.includes(' required'));
state.instructorOptionsError = 'Offline';
vm.runInContext('renderInstructorDropdown()', context);
assert(nodes.get('instructorSelectWrapper').innerHTML.includes('Save as unassigned'));
const start = source.indexOf("    getEl('modalSaveBtn').addEventListener('click'");
vm.runInContext(source.slice(start, source.indexOf('    // ── Quick Links', start)), context);
await save();
assert.equal(calls[0].name, 'save_course_offering_with_instructor');
assert.equal(calls[0].payload.p_instructor_id, null, 'An empty or unavailable instructor list must not prevent an unassigned save');
assert.equal(calls[0].payload.p_semester, 'Summer');
assert(!Object.keys(calls[0].payload).some(key => key.includes('catalog')));
nodes.get('field_instructor_id').value = 'unknown';
await save();
assert.equal(calls.length, 1, 'A selected instructor must still be eligible');
nodes.get('field_instructor_id').value = '';
nodes.get('field_units').value = '0';
await save();
assert.equal(calls.length, 1, 'Zero units must not silently become three units');
nodes.get('field_units').value = '3';
error = { message: 'Database rejected offering' };
await save();
assert.equal(toasts.at(-1)[1], true);
assert.equal(nodes.get('modalSaveBtn').disabled, false);
assert.equal(nodes.get('modalSaveBtn').textContent, 'Save');

let reply;
context.supabaseClient.rpc = (name, payload) => {
  assert.equal(payload.p_offering_id, 11);
  return new Promise(resolve => { reply = resolve; });
};
context.supabaseClient.from = table => ({
  update(payload) { assert.equal(table, 'course_offerings'); assert.equal(payload.code, 'SUM101'); return this; },
  eq(field, id) { assert.equal(field, 'id'); assert.equal(id, 11); return this; },
  select() { return this; },
  async single() { return { data: { id: 11 } }; },
});
context.editingOfferingId = 11;
const pendingSave = save();
context.modalVersion++;
context.editingOfferingId = 22;
nodes.get('modalSaveBtn').textContent = 'Save changes';
reply({ error: { code: 'PGRST202', message: 'Function unavailable' } });
await pendingSave;
assert.equal(closeCount, 1, 'Old save must not close the current form');
assert.equal(nodes.get('modalSaveBtn').textContent, 'Save changes');
assert.equal(nodes.get('modalSaveBtn').disabled, true, 'Old save must not enable a newer save button');

const reads = [];
context.loadInstructorOptions = () => new Promise(resolve => reads.push(resolve));
const refresh = () => vm.runInContext("refreshInstructorDropdown(true, 'old', 'Previous instructor')", context);
const oldRefresh = refresh();
context.modalVersion++;
nodes.get('instructorSelectWrapper').innerHTML = 'New form';
reads[0]();
await oldRefresh;
assert.equal(nodes.get('instructorSelectWrapper').innerHTML, 'New form');
const currentRefresh = refresh();
nodes.get('field_instructor_id').value = '';
reads[1]();
await currentRefresh;
assert(!nodes.get('instructorSelectWrapper').innerHTML.includes('value="old" selected'), 'A deliberate Unassigned choice survives refresh');

const termStart = source.indexOf('    function getTermList()');
vm.runInContext(source.slice(termStart, source.indexOf('    function renderWorkloads()', termStart)), context);
context.termKey = (year, semester) => year + ' · ' + semester;
context.termSortValue = year => Number(year.slice(0, 4));
nodes.set('assignSemesterFilter', {});
nodes.set('assignYearFilter', { value: '' });
const older = { school_year: '2025-2026', semester: '2nd Semester' };
const newer = { school_year: '2026-2027', semester: '1st Semester' };
state.offerings = [older, newer];
context.initTermFilter();
assert.equal(context.offeringsForSelectedTerm()[0], newer);
state.offerings = [older];
context.initTermFilter();
assert.match(nodes.get('assignSemesterFilter').innerHTML, /2025-2026 · 2nd Semester" selected/);
assert.equal(context.offeringsForSelectedTerm()[0], older);
console.log('Dean subject form: validation, fallback target, stale replies, instructor selection, and term removal passed.');

const overview = await loadDashboardView(new URL('./dean-dashboard-view.tsx', import.meta.url));
for (const name of ['EnrollmentStats', 'OverviewBars', 'PerformanceStats', 'FlaggedCourses']) {
  context.window['renderDean' + name] = props => renderToStaticMarkup(createElement(overview['Dean' + name], props));
}
for (const id of ['enrollmentStats', 'programBars', 'semesterTrendBars', 'performanceStats', 'passFailBars', 'flaggedCoursesBody', 'noFlaggedMsg']) {
  nodes.set(id, { style: {} });
}
const overviewStart = source.indexOf('    function renderOverview()');
vm.runInContext(source.slice(overviewStart, termStart), context);
Object.assign(state, { profiles: [], grades: [], enrollments: [], offerings: [] });
context.renderOverview();
assert.match(nodes.get('programBars').innerHTML, /No approved students on file/);
assert.match(nodes.get('semesterTrendBars').innerHTML, /No enrollment history found yet/);
assert.equal(nodes.get('noFlaggedMsg').style.display, 'block');
const course = { code: 'N101', program: 'BSN' };
Object.assign(state, {
  profiles: [{ role: 'student', status: 'approved', program: '<BSN>' }],
  grades: ['Passed', 'Failed', 'Passed'].map(remark => ({ final: 90, equivalent: 2, remark, course_offerings: course })),
  enrollments: [older, newer].map(term => ({ student_id: 'one', course_offerings: term })),
  offerings: [course],
});
context.renderOverview();
assert.match(nodes.get('enrollmentStats').innerHTML, /2\.00.*100%/);
assert.match(nodes.get('programBars').innerHTML, /&lt;BSN&gt;/);
assert.match(nodes.get('semesterTrendBars').innerHTML, /2025-2026.*2026-2027/);
assert.match(nodes.get('performanceStats').innerHTML, /Passed.*>2<.*Failed.*>1<.*Pending.*>0</);
assert.match(nodes.get('passFailBars').innerHTML, /67%.*33%/);
assert.match(nodes.get('flaggedCoursesBody').innerHTML, /N101.*33%/);
assert.equal(nodes.get('noFlaggedMsg').style.display, 'none');
console.log('Dean overview: empty state, retention, grade counts, flagged courses, and escaped labels passed.');
