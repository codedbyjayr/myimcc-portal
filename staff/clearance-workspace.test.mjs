import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { clearStudent, loadClearances } from './clearance-workspace.ts';
import { loadDashboardView } from '../scripts/dashboard-markup.mjs';

const { saveClearanceNote } = await loadDashboardView(new URL('../shared/clearance-note.tsx', import.meta.url));

const context = vm.createContext({ document: { currentScript: null } });
vm.runInContext(readFileSync(new URL('../shared/identity.js', import.meta.url), 'utf8'), context);
globalThis.window = { IMCC: context.IMCC };

const row = { id: 'clearance-id', student_id: 'student-id', department_code: 'LIB', status: 'pending' };
let rows = [row], readError = null, saveError = null, saveRow = { id: row.id }, failAt = null;
let reads = 0;
const filters = [], updates = [];
const client = {
  rpc(name) {
    assert.equal(name, 'get_clearance_workspace');
    return {
      order(column) { assert.equal(column, 'id'); return this; },
      async range(from, to) {
        reads++;
        assert.equal(to, from + 499);
        return { data: rows.slice(from, Math.min(to + 1, from + 137)), error: readError || (failAt !== null && from >= failAt ? { message: 'Later page denied' } : null) };
      },
    };
  },
  from(name) {
    assert.equal(name, 'clearances');
    return {
      update(value) { updates.push(value); return this; },
      eq(key, value) { filters.push([key, value]); return this; },
      is(key, value) { filters.push([key, value]); return this; },
      select(columns) { assert(['id', 'note'].includes(columns)); return this; },
      async single() { return { data: saveRow, error: saveError }; },
      async maybeSingle() { return { data: saveRow, error: saveError }; },
    };
  },
};

assert.deepEqual(Array.from(await loadClearances(client)), [row]);
await clearStudent(client, row);
assert.deepEqual(filters, [['id', row.id], ['student_id', row.student_id], ['department_code', row.department_code], ['status', row.status]]);
assert.equal(updates[0].status, 'cleared');
assert(Number.isFinite(Date.parse(updates[0].cleared_at)));
saveError = { message: 'Write denied' };
await assert.rejects(clearStudent(client, row), /Write denied/);
saveError = null;
saveRow = null;
await assert.rejects(clearStudent(client, row), /No clearance was changed/);
await assert.rejects(saveClearanceNote(client, { ...row, note: 'Old note' }, 'Changed'), /Refresh the record/);
assert.deepEqual(filters.slice(-2), [['status', 'pending'], ['note', 'Old note']]);
saveRow = { note: null };
assert.equal(await saveClearanceNote(client, { ...row, note: 'Old note' }, '   '), null);
assert.deepEqual(updates.at(-1), { note: null });
const updateCount = updates.length;
await assert.rejects(saveClearanceNote(client, row, 'a'.repeat(1001)), /at most 1000/);
await assert.rejects(saveClearanceNote(client, { ...row, status: 'cleared' }, 'New note'), /already cleared/);
assert.equal(updates.length, updateCount);
rows = Array.from({ length: 1206 }, (_, id) => ({ ...row, id }));
assert.equal((await loadClearances(client)).length, 1206, 'All pages load even with a lower API cap');
assert(reads > 2);
failAt = 500;
await assert.rejects(loadClearances(client), /Later page denied/, 'A partial result must never replace the complete workspace');
failAt = null;
readError = { message: 'Read denied' };
await assert.rejects(loadClearances(client), /Read denied/);
readError = null;
rows = [];
assert.equal((await loadClearances(client)).length, 0);
console.log('Clearance data: scoped verified saves, failed/zero-row writes, complete pagination, partial-read rejection, and empty results passed.');
