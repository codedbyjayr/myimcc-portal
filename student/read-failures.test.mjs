import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('./dashboard.js', import.meta.url), 'utf8');
for (const section of ['billing','attendance']) {
  const start = source.indexOf(section === 'billing' ? 'function studentBillingBalance(' : 'async function loadAttendance()');
  const end = source.indexOf(section === 'billing' ? 'function renderBilling()' : '// ── Faculty Evaluation Module', start);
  for (const failedTable of section === 'billing' ? ['student_semesters','billing_summary','transactions','installments','enrollments','misc_fees'] : ['attendance']) {
    let failing = true, notice, rendered = 0, removed = 0;
    const billing = { balance: 750 };
    const state = { studentProfile: { id: 'student' }, billing };
    const query = table => ({ select() { return this; }, eq() { return this; }, order() { return this; }, maybeSingle() { return this; },
      then(resolve) { resolve({ data: table === 'student_semesters' ? null : [], error: failing && table === failedTable ? { message: 'offline' } : null }); } });
    const context = { state, supabaseClient: { from: query },
      getEl: () => ({ remove() { removed++; }, innerHTML: '' }), setText() { rendered++; },
      showReadFailure(name, retry) { notice = { name, retry }; },
      renderBilling() { rendered++; },
    };
    vm.runInNewContext(source.slice(start,end),context);
    if (failedTable === 'billing_summary') {
      assert.equal(context.studentBillingBalance({ balance: 5500 }, 10000, 4000), 5500);
      assert.equal(context.studentBillingBalance({ balance: 0 }, 10000, 4000), 0);
      assert.equal(context.studentBillingBalance({ balance: null }, 10000, 4000), 6000);
      assert.equal(context.studentBillingBalance(null, 10000, 11000), 0);
    }
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

for (const path of ['./dashboard.js', '../review-assets/student/dashboard.js']) {
  const dashboard = readFileSync(new URL(path, import.meta.url), 'utf8');
  const billingStart = dashboard.indexOf('function csvField(');
  const billingEnd = dashboard.indexOf("getEl('gradeYearFilter')", billingStart);
  const receipt = `OR'123" <sample>`;
  let click;
  let toast;
  class ReceiptButton {
    dataset = { receipt };
    closest(selector) { return selector === 'button[data-receipt]' ? this : null; }
  }
  const { csvField } = vm.runInNewContext(dashboard.slice(billingStart, billingEnd) + '\n({ csvField })', {
    Element: ReceiptButton,
    getEl: () => ({ addEventListener(event, handler) {
      assert.equal(event, 'click');
      click = handler;
    } }),
    showToast: message => { toast = message; },
  });
  click({ target: new ReceiptButton() });
  assert.equal(toast, `OR #${receipt} recorded.`);
  assert.equal(csvField('OR,123'), '"OR,123"');
  assert.equal(csvField('Paid "in full"'), '"Paid ""in full"""');
  assert.equal(csvField('=1+1'), '"\t=1+1"');
  assert.equal(csvField(-50), '"-50"');
}
