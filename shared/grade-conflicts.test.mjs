import assert from 'node:assert/strict';
import './grading.js';

const db = new Map();
let sequence = 0, writes = 0;
const client = { from(table) {
  assert.equal(table, 'grades');
  let payload, insert = false;
  const filters = [];
  return {
    update(value) { payload = value; return this; },
    insert(value) { payload = value; insert = true; return this; },
    eq(key, value) { filters.push([key, value]); return this; },
    is(key, value) { assert.equal(value, null); filters.push([key, null]); return this; },
    select() { return this; },
    async maybeSingle() {
      const current = db.get(payload.student_id);
      if (insert && current) return { data: null, error: { code: '23505' } };
      if (!insert && (!current || filters.some(([key, value]) => current[key] !== value))) return { data: null, error: null };
      writes++;
      const data = { ...current, ...payload, id: current?.id || payload.student_id, graded_at: String(++sequence) };
      db.set(payload.student_id, data);
      return { data, error: null };
    },
  };
} };
const load = id => {
  const savedGrade = structuredClone(db.get(id) || null);
  return { ...savedGrade, student: { id }, savedGrade };
};
const save = row => Grading.saveGrade(client, row, 1);
for (const id of ['A', 'B']) db.set(id, { id, student_id: id, offering_id: 1, prelim: 1, graded_at: '0', grade_scale: 'school' });
const tabA = [load('A'), load('B')], tabB = [load('A'), load('B')];
tabA[0].prelim = 2; tabB[1].prelim = 3;
assert((await save(tabA[0])).data);
assert((await save(tabA[1])).skipped);
assert((await save(tabB[0])).skipped);
assert((await save(tabB[1])).data);
assert.equal(db.get('A').prelim, 2); assert.equal(db.get('B').prelim, 3);
assert.equal(writes, 2, 'Only edited students are written');
tabB[0].prelim = 1.5;
assert.match((await save(tabB[0])).error.message, /Reload/);
assert.equal(db.get('A').prelim, 2, 'Stale edit cannot overwrite a newer save');
assert.equal(tabB[0].prelim, 1.5, 'Conflicting edits stay in the roster');
const first = load('new'), second = load('new');
first.prelim = 1.1; second.prelim = 2;
assert((await save(first)).data);
assert.match((await save(second)).error.message, /Another editor/);
assert.equal(db.get('new').prelim, 1.1, 'A concurrent insert cannot become an overwrite');
const empty = load('empty');
assert((await save(empty)).skipped, 'Untouched blank grades are not inserted');
db.set('null-time', { id: 'null-time', student_id: 'null-time', offering_id: 1, prelim: 1, graded_at: null });
const nullTime = load('null-time'); nullTime.prelim = 2;
assert((await save(nullTime)).data, 'Existing null timestamps use an IS NULL condition');
console.log('Grade conflicts: changed rows only, stale updates, concurrent inserts, retained edits and null timestamps passed.');
