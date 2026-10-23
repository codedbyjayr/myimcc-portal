import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('./dean-dashboard.js', import.meta.url), 'utf8');
const actual = source.slice(source.indexOf('    async function assignFaculty(sel)'), source.indexOf('    // ── Faculty Performance Log'));
const offering = { id: 1, instructor_id: 'old', instructor_name: 'Old Teacher' };
const select = { dataset: { id: '1' }, value: 'new', disabled: false };
const calls = [], toasts = [];
let error = null, empty = false, payload;
const context = vm.createContext({
  state: { offerings: [offering], facultyList: [{ id: 'new', full_name: 'New Teacher' }] },
  supabaseClient: { from(table) {
    assert.equal(table, 'course_offerings', 'Only the offering is written; trigger owns assignment synchronization');
    calls.push(table);
    return { update(values) { payload = values; return this; }, eq() { return this; }, select() { return this; },
      async single() { assert.equal(select.disabled, true); return { data: empty ? null : { ...offering, ...payload }, error }; } };
  } },
  showToast: (...args) => toasts.push(args), renderWorkloads() {}, renderConflicts() {}, loadMyClasses() {},
});
vm.runInContext(actual, context);
const save = () => { context.sel = select; return vm.runInContext('assignFaculty(sel)', context); };
await save();
assert.equal(calls.length, 1);
assert.equal(offering.instructor_id, 'new');
assert.equal(select.disabled, false);
select.value = '';
await save();
assert.equal(offering.instructor_id, null);
assert.equal(offering.instructor_name, null);
select.value = 'new'; error = { message: 'Assignment trigger failed' };
await save();
assert.equal(select.value, '');
assert.equal(offering.instructor_id, null);
assert.equal(toasts.at(-1)[1], true);
assert.equal(calls.length, 3, 'No name-only retry after an error');
error = null; empty = true; select.value = 'new';
await save();
assert.equal(select.value, '');
assert.equal(toasts.at(-1)[1], true, 'Zero updated rows must not report success');
select.value = 'unknown';
await save();
assert.equal(calls.length, 4, 'Unknown instructor must not write');
assert.equal(select.value, '');
const fallback = source.slice(source.indexOf('const isRpcMissing'), source.indexOf("showToast(editingOfferingId ? 'Updated successfully.'"));
assert(!fallback.includes("from('teacher_assignments')"), 'Modal fallback must leave synchronization to the same trigger');
console.log('Assignment save: one write, unassignment, failure rollback, zero rows, and modal fallback passed');
