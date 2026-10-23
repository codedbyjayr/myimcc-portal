import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const context = vm.createContext({ document: { currentScript: null } });
vm.runInContext(readFileSync(new URL('./identity.js', import.meta.url), 'utf8'), context);
const rows = Array.from({ length: 1203 }, (_, id) => ({ id }));
for (const cap of [500, 137]) {
  let calls = 0;
  const result = await context.IMCC.fetchAll(() => ({
    order(column) { assert.equal(column, 'id'); return this; },
    async range(from, to) { calls++; return { data: rows.slice(from, Math.min(to + 1, from + cap)), error: null }; },
  }));
  assert.equal(result.error, null);
  assert.equal(result.data.length, 1203);
  assert.equal(new Set(result.data.map(r => r.id)).size, 1203);
  assert(calls > 2);
}
let calls = 0;
const failed = await context.IMCC.fetchAll(() => ({
  order() { return this; },
  async range() { return ++calls === 1 ? { data: rows.slice(0, 500) } : { error: { message: 'Denied' } }; },
}));
assert.equal(failed.data, null, 'Never return a partial list as a complete one');
assert.equal(failed.error.message, 'Denied');
console.log('Pagination: over 1,000 rows, lower server caps, stable order and later-page failures passed.');

// Exercise each real startup loader with its own shared identity module.
for (const [prefix, expectedRpc] of [['', 'get_dean_student_directory'], ['review-assets/', 'list_student_records']]) {
  const context = vm.createContext({document:{currentScript:null}});
  vm.runInContext(readFileSync(new URL('../' + prefix + 'shared/identity.js', import.meta.url), 'utf8'), context);
  const dean = readFileSync(new URL('../' + prefix + 'faculty/dean-dashboard.js', import.meta.url), 'utf8');
  context.currentProfile = { id: 'dean', role: 'dean' };
  context.state = {};
  context.loadInstructorOptions = async () => {};
  context.supabaseClient = {
    rpc: async name => { assert.equal(name, expectedRpc); return { data: [{ id: 'student', role: 'student' }], error: null }; },
    from: () => ({
      select() { return this; }, eq() { return this; }, order() { return this; },
      async range(from, to) { return { data: rows.slice(from, to + 1), error: null }; },
    }),
  };
  const start = dean.indexOf('    async function loadAllData(');
  vm.runInContext(dean.slice(start, dean.indexOf('    // ═', start)), context);
  await vm.runInContext('loadAllData()', context);
  for (const key of ['offerings', 'grades', 'enrollments', 'courses']) assert.equal(context.state[key].length, 1203);
  const previousGrades = context.state.grades;
  context.supabaseClient.rpc = async () => ({ data: null, error: { message: 'Denied' } });
  await assert.rejects(vm.runInContext('loadAllData()', context), /Denied/);
  assert.equal(context.state.grades, previousGrades, 'A failed reload preserves displayed data');
}
console.log('Production and review Dean startup: matching helpers/RPCs, complete lists and failed-reload retention passed.');
