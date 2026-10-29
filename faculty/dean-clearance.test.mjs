import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('./dean-dashboard.js', import.meta.url), 'utf8');
const nodes = new Map(), toasts = [], filters = [];
const getEl = id => {
  if (!nodes.has(id)) nodes.set(id, { value: '', handlers: {}, addEventListener(name, fn) { this.handlers[name] = fn; } });
  return nodes.get(id);
};
let saved = { id: 'dean-clearance' }, error = null, writes = 0;
const clearances = [
  { id: 'dean-clearance', department_code: 'dean', department_name: 'College Dean', status: 'pending', note: '<script>bad</script>' },
  { id: 'library-clearance', department_code: 'library', department_name: 'Library', status: 'pending' },
];
const context = vm.createContext({
  state: { profiles: [{ id: 'student', full_name: 'Student' }] }, getEl,
  fmtDate: String, showToast: (...args) => toasts.push(args),
  supabaseClient: {
    rpc: async name => { assert.equal(name, 'get_student_record'); return { data: { clearances } }; },
    from: table => {
      assert.equal(table, 'clearances');
      return {
        update(value) { writes++; assert.equal(value.status, 'cleared'); assert(value.cleared_at); return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        select(columns) { assert.equal(columns, 'id'); return this; },
        async single() { return { data: saved, error }; },
      };
    },
  },
});
vm.runInContext(readFileSync(new URL('../shared/ui.js', import.meta.url), 'utf8'), context);
vm.runInContext('const escapeHtml = UIM.escapeHtml;', context);
vm.runInContext(source.slice(source.indexOf('    let selectedRecord'), source.indexOf('    // ══', source.indexOf('    let selectedRecord'))), context);
await context.loadStudentRecord('clearance', 'student');
assert.match(getEl('clearanceDetails').innerHTML, /✓ Clear College Dean requirement/);
assert.equal((getEl('clearanceDetails').innerHTML.match(/data-clearance-id=/g) || []).length, 1);
assert(!getEl('clearanceDetails').innerHTML.includes('<script>'));
const button = { dataset: { clearanceId: 'dean-clearance' }, disabled: false };
const event = { target: { closest: () => button } };
const click = getEl('clearanceDetails').handlers.click;
const saving = click(event);
await click(event);
await saving;
assert.equal(writes, 1, 'Double clicking saves only once');
assert.deepEqual(filters, [['id', 'dean-clearance'], ['student_id', 'student'], ['department_code', 'dean']]);
assert.equal(toasts.at(-1)[0], 'College Dean clearance approved.');
error = { message: 'Permission denied' };
await click(event);
assert.equal(toasts.at(-1)[1], true);
assert.equal(button.disabled, false, 'A failed save permits retry');
error = null; saved = null;
await click(event);
assert.match(toasts.at(-1)[0], /No clearance was changed/);
clearances[0].status = 'cleared';
await context.loadStudentRecord('clearance', 'student');
assert(!getEl('clearanceDetails').innerHTML.includes('data-clearance-id='), 'Already cleared requirements have no approval button');
console.log('Dean clearance: scoped action, safe rendering, verified save, double click and failed-save retry passed.');
