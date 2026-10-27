import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('./dashboard.js', import.meta.url), 'utf8');
for (const section of ['billing','attendance']) {
  const start = source.indexOf(section === 'billing' ? 'async function loadBilling()' : 'async function loadAttendance()');
  const end = source.indexOf(section === 'billing' ? 'function renderBillingStats()' : '// ── Faculty Evaluation Module', start);
  for (const failedTable of section === 'billing' ? ['student_semesters','billing_summary','transactions','installments','enrollments','misc_fees'] : ['attendance']) {
    let failing = true, notice, rendered = 0, removed = 0;
    const billing = { balance: 750 };
    const state = { studentProfile: { id: 'student' }, billing };
    const query = table => ({ select() { return this; }, eq() { return this; }, order() { return this; }, maybeSingle() { return this; },
      then(resolve) { resolve({ data: table === 'student_semesters' ? null : [], error: failing && table === failedTable ? { message: 'offline' } : null }); } });
    const context = { state, supabaseClient: { from: query },
      getEl: () => ({ remove() { removed++; }, innerHTML: '' }), setText() { rendered++; },
      showReadFailure(name, retry) { notice = { name, retry }; },
      renderBillingStats() { rendered++; }, renderBillingBreakdown() {},renderInstallments() {},renderUpay() {},renderTxns() {},
    };
    vm.runInNewContext(source.slice(start,end),context);
    await context[section === 'billing' ? 'loadBilling' : 'loadAttendance']();
    assert.equal(notice.name,section);
    assert.equal(rendered,0);
    assert.equal(state.billing,billing,'Failed read must retain existing state');
    failing = false;
    await notice.retry();
    assert(rendered>0);
    assert.equal(removed,1);
  }
}
console.log('Billing and attendance: each failed query preserves displayed data; retry recovers.');

let notice, button, retry, attempts = 0;
const controls = new Map();
const context = { getEl: id => controls.get(id) || (id==='page-billing' ? { prepend(node) { controls.set(node.id,node); notice=node; } } : null),
  document: { createElement: tag => tag==='button' ? (button={addEventListener(_,fn){retry=fn;}})
    : {setAttribute(name,value){this[name]=value;},append(node){this.child=node;}} } };
const start = source.indexOf('function showReadFailure(');
vm.runInNewContext(source.slice(start,source.indexOf('async function loadAttendance()',start)),context);
context.showReadFailure('billing',async()=>{attempts++;});
assert.equal(notice.role,'alert');
assert.equal(button.textContent,'Retry');
await retry();
assert.equal(attempts,1);
assert.equal(button.disabled,false);
const first=notice;
context.showReadFailure('billing',async()=>{});
assert.equal(notice,first,'Repeated failures do not duplicate notices');
