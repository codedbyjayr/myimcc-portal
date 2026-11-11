import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('./dashboard.js', import.meta.url), 'utf8');
const start = source.indexOf("getEl('retryClearance')");
const end = source.indexOf('function renderClearance(', start);
for (const fails of [true, false]) {
  let rendered = 0, retry;
  const labels = new Map();
  const grid = { replaceChildren() { this.cleared = true; } };
  const fill = { style: {} };
  const notice = { hidden: true };
  const state = { studentProfile: { id: 'student' } };
  const result = { data: fails ? null : [], error: fails ? { message: 'Network unavailable' } : null };
  const query = { select() { return this; }, eq(column, id) {
    assert.equal(column, 'student_id'); assert.equal(id, 'student'); return this;
  }, async order() { return result; } };
  let departments;
  const elements = { deptGrid: grid, clearFill: fill, clearanceLoadError: notice,
    retryClearance: { addEventListener(event, callback) { retry = callback; } } };
  const context = { state, supabaseClient: { from: () => query },
    getEl: id => elements[id], setText: (id, text) => labels.set(id, text), showToast() {},
    renderClearance(rows) { rendered++; departments = rows; },
  };
  vm.runInNewContext(source.slice(start, end), context);
  await context.loadClearance();
  assert.equal(rendered, fails ? 0 : 1);
  assert.equal(notice.hidden, !fails);
  if (fails) {
    assert.equal(labels.get('clearFrac'), 'Unavailable');
    assert.equal(grid.cleared, true);
    assert.equal(typeof retry, 'function');
    result.error = null; result.data = [{ status: 'pending' }];
    await retry();
    assert.equal(rendered, 1);
    assert.equal(notice.hidden, true);
    assert.equal(departments[0].status, 'pending');
  } else {
    assert.equal(departments.length, 0);
  }
}
assert(!source.slice(start, end).includes('initialize_student_clearances'), 'Clearance initialization belongs to the enrollment trigger, not a denied student RPC');
console.log('Clearance: failed reads show unavailable, successful empty reads stay distinct, and retry recovers.');
