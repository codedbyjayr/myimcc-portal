import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadDashboardView } from '../scripts/dashboard-markup.mjs';

const view = await loadDashboardView(new URL('./gradebook-view.tsx', import.meta.url));
const picker = props => renderToStaticMarkup(createElement(view.CourseList, {
  offerings: [{ id: 1, instructor_name: '<Dean>' }, { id: 2 }],
  selectedId: '1',
  ...props,
}));
assert.match(picker({ showInstructor: true }), /data-id="1" aria-pressed="true".*&lt;Dean&gt;.*data-id="2" aria-pressed="false".*Unassigned/);
assert.doesNotMatch(picker({}), /&lt;Dean&gt;|Unassigned/);
for (const role of ['Teacher', 'Dean']) {
  const dean = role === 'Dean';
  const source = readFileSync(new URL('./' + role.toLowerCase() + '-dashboard.js', import.meta.url), 'utf8');
  assert.doesNotThrow(() => new vm.Script(source));
  const nodes = new Map();
  const getEl = id => {
    if (!nodes.has(id)) nodes.set(id, { style: {}, replaceChildren() {}, querySelectorAll: () => [] });
    return nodes.get(id);
  };
  const modal = Object.assign(getEl('gradeHistoryModal'), {
    open: false, showModal() { this.open = true; }, close() { this.open = false; },
  });
  const rosterReads = [], historyReads = [], scopeReads = [];
  const offerings = [{ id: 1 }, { id: 2 }];
  let listedOfferings;
  const context = vm.createContext({
    selectedOffering: null, roster: [], offerings, rosterVersion: 0, historyVersion: 0,
    selectedMyOffering: null, myRoster: [], myOfferings: offerings, classListVersion: 0, deanCourseScope: 'my',
    currentProfile: { role: 'dean' }, currentUserId: 'dean', state: { offerings },
    renderMyCourseList: () => { listedOfferings = context.myOfferings; }, renderMyRoster() {},
    getEl, document: { querySelectorAll: () => [] }, renderRoster() {}, showToast() {},
    gradingWorkspace: { canLeave: () => true, startClass() {}, setLocked() {}, setReadOnly() {}, markClean() {}, refresh() {} },
    supabaseClient: {
      rpc: () => new Promise(resolve => rosterReads.push(resolve)),
      from: () => ({
        select(fields) { this.fields = fields; return this; }, eq() { return this; }, limit() { return this; },
        single: async () => ({ data: { grades_locked: false } }),
        then(resolve) {
          if (this.fields === 'offering_id, course_offerings(*)') return scopeReads.push(resolve);
          return Promise.resolve({ data: [] }).then(resolve);
        },
        order: () => new Promise(resolve => historyReads.push(resolve)),
      }),
    },
    window: Object.fromEntries(['HistorySummary', 'HistoryRows', 'HistoryMessage']
      .map(name => ['render' + role + name, props => renderToStaticMarkup(createElement(view['Grade' + name], props))])),
  });
  for (const [start, end] of [
    ...(dean ? [
      ['function resetMyRoster()', 'function renderMyCourseList('],
      ['async function selectMyCourse(', 'function renderMyRoster('],
      ['function closeDeanGradeHistory()', 'async function executeDeanRevert('],
    ] : [
      ['async function selectCourse(', 'function renderRoster('],
      ['function closeGradeHistory()', 'async function executeRevert('],
    ]),
  ]) vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end)), context);

  if (dean) {
    const staleScope = context.loadMyClasses();
    await Promise.resolve();
    context.deanCourseScope = 'all';
    await context.loadMyClasses();
    scopeReads[0]({ data: [{ course_offerings: offerings[0] }] });
    await staleScope;
    assert.equal(listedOfferings.length, 2, 'Late My Classes response must not replace All Classes');
  }
  const selectCourse = dean ? context.selectMyCourse : context.selectCourse;
  const openGradeHistory = dean ? context.openDeanGradeHistory : context.openGradeHistory;
  const closeGradeHistory = dean ? context.closeDeanGradeHistory : context.closeGradeHistory;

  const enrollment = name => ({ data: [{ student_id: name, profiles: { id: name, full_name: name } }] });
  const first = selectCourse(1);
  const second = selectCourse(2);
  const third = selectCourse(1);
  rosterReads[2](enrollment('Current'));
  await third;
  rosterReads[0](enrollment('Stale'));
  rosterReads[1](enrollment('Other'));
  await Promise.all([first, second]);
  assert.equal((dean ? context.myRoster : context.roster)[0].student.full_name, 'Current');

  const revision = id => ({ data: [{ id, student_id: id, created_at: '2026-10-01T00:00:00Z' }] });
  const saved = openGradeHistory({
    student: { id: 'a', full_name: 'Alice' },
    final: 1.75, equivalent: 1.25, savedGrade: { final: 2, equivalent: 2.5 },
  });
  const summary = getEl('gradeHistoryCurrentBox').innerHTML;
  assert.match(summary, /Saved in Portal/);
  assert.match(summary, /2\.00.*2\.50/);
  assert.doesNotMatch(summary, /1\.75|1\.25/);
  const current = openGradeHistory({ student: { id: 'b', full_name: 'Beth' }, final: 1.25 });
  assert.match(getEl('gradeHistoryCurrentBox').innerHTML, /No grade has been saved/);
  historyReads[1](revision('beth-revision'));
  await current;
  historyReads[0](revision('alice-revision'));
  await saved;
  assert.match(getEl('gradeHistoryModalTitle').textContent, /Beth/);
  assert.match(getEl('gradeHistoryBody').innerHTML, /beth-revision/);
  if (dean) assert.match(getEl('gradeHistoryBody').innerHTML, /disabled=""/, 'Unassigned Dean cannot revert');
  assert.doesNotMatch(getEl('gradeHistoryBody').innerHTML, /alice-revision/);

  const closed = openGradeHistory();
  closeGradeHistory();
  historyReads[2](revision('closed-revision'));
  await closed;
  assert.equal(modal.open, false);
  assert.doesNotMatch(getEl('gradeHistoryBody').innerHTML, /closed-revision/);
}
console.log('Faculty gradebooks: latest scope, roster and history win, closed dialog ignores responses, and history shows saved values.');
