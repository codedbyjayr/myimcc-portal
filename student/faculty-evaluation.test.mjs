// Run: node student/faculty-evaluation.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./dashboard.js', import.meta.url), 'utf8');
const loader = source.slice(source.indexOf('async function loadFacultyEval()'), source.indexOf('// ── Profile Module'));
const a = '00000000-0000-0000-0000-000000000001';
const b = '00000000-0000-0000-0000-000000000002';
let existing = [];
let inserted;
let selected;
const list = {
  innerHTML: '',
  querySelectorAll(selector) {
    if (selector !== '.eval-submit-btn') return [];
    return [...this.innerHTML.matchAll(/data-instructor-id="([^"]+)"/g)].map(([, id]) => ({
      dataset: { instructorId: id },
      closest: () => ({
        querySelectorAll: () => ['teaching_clarity', 'knowledge', 'availability', 'fairness', 'punctuality']
          .map(key => ({ dataset: { key, selected: '5' } })),
        querySelector: () => ({ value: '' }),
      }),
      addEventListener(_, callback) { this.click = callback; buttons.push(this); },
    }));
  },
};
let buttons = [];
const client = {
  from(table) {
    const query = {
      select(columns) { selected = columns; return this; },
      eq() { return this; },
      maybeSingle: async () => ({ data: { school_year: '2026-2027', semester: '1st Semester' } }),
      insert: async payload => { inserted = payload; return {}; },
      then(resolve) {
        if (table === 'faculty_evaluations') {
          assert.equal(selected, 'instructor_id');
          return resolve({ data: existing });
        }
        assert(selected.includes('instructor_id'));
        return resolve({ data: [a, b, null].map((id, index) => ({
          course_offerings: { id: index, instructor_id: id, instructor_name: 'Same Name', code: 'C', title: 'Course' },
        })) });
      },
    };
    return query;
  },
};
const context = vm.createContext({
  state: { studentProfile: { id: 'student' } }, supabaseClient: client,
  getEl: id => id === 'evalList' ? list : { style: {} }, setText() {},
  escapeHtml: value => value, showToast() {},
});
vm.runInContext(loader, context);
await context.loadFacultyEval();
assert.deepEqual(buttons.map(button => button.dataset.instructorId), [a, b]);
await buttons[1].click();
assert.equal(inserted.instructor_id, b);
assert.equal(inserted.instructor_name, 'Same Name');
assert.equal(inserted.student_id, 'student');

buttons = [];
existing = [{ instructor_id: a }];
await context.loadFacultyEval();
assert.deepEqual(buttons.map(button => button.dataset.instructorId), [b]);
console.log('Faculty evaluations: same-name grouping, ID submission, and dedup passed.');
