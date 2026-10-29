import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

for (const prefix of ['', '../review-assets/student/']) {
  const source = readFileSync(new URL(prefix + 'dashboard.js', import.meta.url), 'utf8');
  for (const initial of ['error', 'empty', 'null', 'ok']) {
    let mode = initial, displayed, notice;
    const requests = [];
    const button = { disabled: false, textContent: 'View Degree Prospectus' };
    const courses = [
      { code: 'CC 101', title: 'Introduction to Computing', year_level: 1, semester: 1, lec_units: 2, lab_units: 1 },
      { code: 'PRAC 101', title: 'IT Practicum', year_level: 4, semester: 2, lec_units: 0, lab_units: 6 },
    ];
    const context = vm.createContext({
      window: {},
      state: { studentProfile: { id: 'fictional-student', program: 'BSIT' } },
      getEl: id => id === 'prospectusBtn' ? button : null,
      escapeHtml: String, Grading: { formatGrade: String },
      console: { error() {} },
      showToast: message => { notice = message; },
      showProspectusModal: data => { displayed = data; },
      supabaseClient: { from(table) {
        requests.push(table);
        assert.notEqual(table, 'course_offerings', 'Offerings must never substitute for curriculum');
        const query = {
          select() { return this; }, order() { return this; }, eq() { return this; },
          then(resolve) { return Promise.resolve({
            data: table !== 'courses' || mode === 'empty' ? [] : mode === 'null' ? null : courses,
            error: table === 'courses' && mode === 'error' ? { message: 'Catalog read failed' } : null,
          }).then(resolve); },
        };
        return query;
      } },
    });
    vm.runInContext(source.slice(source.indexOf('function getOrdinalSuffix('), source.indexOf('function showProspectusModal(')), context);
    await context.viewProspectus();
    if (initial !== 'ok') {
      assert.equal(displayed, undefined, 'Do not show an invented or empty curriculum');
      assert.match(notice, initial === 'error' ? /Catalog read failed/ : /curriculum is unavailable/);
      assert.deepEqual(requests, ['courses'], 'Stop when the catalog cannot load');
      assert.equal(button.disabled, false);
      mode = 'ok';
      await context.viewProspectus();
    }
    assert.equal(displayed.totalUnits, 9, 'Keep lecture and lab units, including practicum');
    assert.equal(displayed.bySemester.flatMap(term => term.courses).length, 2);
    assert.equal(button.disabled, false, 'Allow retry after a failure');
    assert.equal(button.textContent, 'View Degree Prospectus');
  }
}
console.log('Prospectus: catalog errors/empty/null stop without offering fallback; retry, units and normal/demo paths passed.');
