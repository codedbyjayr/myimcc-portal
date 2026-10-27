import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import '../shared/grading.js';

for (const role of ['teacher', 'dean']) {
  const source = readFileSync(new URL(`./${role}-dashboard.js`, import.meta.url), 'utf8');
  const isDean = role === 'dean';
  const start = source.indexOf(`    getEl('${isDean ? 'saveMyGradesBtn' : 'saveGradesBtn'}').addEventListener`);
  const end = source.indexOf('    // ──', start);
  for (const fail of [false, true]) {
    let save, clean = 0, failed = 0, rendered = 0;
    const roster = [{ student: { id: 'student' }, grade_scale: 'school', prelim: 1.1, final: 2, equivalent: 1.5, remark: 'Pending' }];
    const button = { addEventListener(event, callback) { save = callback; } };
    const query = {
      insert() { return this; }, select() { return this; },
      async maybeSingle() { return fail ? { error: { message: 'Denied' } } : { data: { id: 'saved', prelim: 1.1, final: 2, equivalent: 2, remark: 'Passed', grade_scale: 'school' } }; },
    };
    const context = {
      roster, myRoster: roster, selectedOffering: { id: 1 }, selectedMyOffering: { id: 1, canEditGrades: true },
      currentUser: { id: 'teacher' }, currentUserId: 'dean', Grading: globalThis.Grading,
      supabaseClient: { from: () => query }, getEl: () => button, showToast() {},
      gradingWorkspace: { validate: () => true, setSaving() {}, markClean() { clean++; }, saveFailed() { failed++; } },
      renderRoster() { rendered++; }, renderMyRoster() { rendered++; }, loadDashboardStats() {},
      IMCC: { fetchAll: async () => ({ data: [], error: null }) }, state: {}, renderOverview() {}, renderGradReadiness() {},
    };
    vm.runInNewContext(source.slice(start, end), context);
    await save();
    assert.equal(rendered, fail ? 0 : 1);
    assert.equal(clean, fail ? 0 : 1);
    assert.equal(failed, fail ? 1 : 0);
    assert.equal(roster[0].equivalent, fail ? 1.5 : 2, 'Successful save must show the server result; failure must keep edits');
    assert.equal(roster[0].remark, fail ? 'Pending' : 'Passed');
  }
}
console.log('Grade saves: both role handlers display server values and retain failed edits.');
