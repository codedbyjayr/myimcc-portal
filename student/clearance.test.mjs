import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('./dashboard.js', import.meta.url), 'utf8');
const start = source.indexOf('async function loadClearance()');
const end = source.indexOf('function renderClearance()', start);
for (const fails of [true, false]) {
  let rendered = 0, retry;
  const labels = new Map();
  const grid = { textContent: '', append() {} };
  const fill = { style: {} };
  const state = { studentProfile: { id: 'student' }, departments: [{ status: 'pending' }] };
  const result = { data: fails ? null : [], error: fails ? { message: 'Network unavailable' } : null };
  const query = { select() { return this; }, eq() { return this; }, async order() { return result; } };
  const context = { state, supabaseClient: { from: () => query },
    getEl: id => id === 'deptGrid' ? grid : fill, setText: (id, text) => labels.set(id, text), showToast() {},
    document: { createElement: () => ({ addEventListener(event, callback) { retry = callback; } }) },
    renderClearance() { rendered++; },
  };
  vm.runInNewContext(source.slice(start, end), context);
  await context.loadClearance();
  assert.equal(rendered, fails ? 0 : 1);
  if (fails) {
    assert.equal(labels.get('clearFrac'), 'Unavailable');
    assert.equal(typeof retry, 'function');
    result.error = null; result.data = [{ status: 'pending' }];
    await retry();
    assert.equal(rendered, 1);
    assert.equal(state.departments[0].status, 'pending');
  }
}
assert(!source.slice(start, end).includes('initialize_student_clearances'), 'Clearance initialization belongs to the enrollment trigger, not a denied student RPC');
console.log('Clearance: failed reads show unavailable, successful empty reads stay distinct, and retry recovers.');
