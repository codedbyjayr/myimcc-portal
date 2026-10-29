import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

for (const root of ['', '../review-assets/admin/']) {
  const source = readFileSync(new URL(root + 'admin-dashboard.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL(root + 'admin-dashboard.html', import.meta.url), 'utf8');
  const previewRole = {};
  const context = vm.createContext({ previewRole, escapeHtml: String });
  vm.runInContext(source.slice(source.indexOf('    const roleChoices ='), source.indexOf('    async function checkAdminAuth()')), context);
  const choices = [
    ...['Guidance','Cashier','DSA','Laboratory/Nursing Arts/Cybershack','Library','Medical Clinic/Dental','Property Custodian','ROTC/CWTS'].map(department => ['staff',department]),
    ...['CCS','CBA','CAS','CNM','CED','CCSJE','CHTM','CMT','CRT'].map(department => ['dean',department]),
  ];
  for (const [role, department] of choices) {
    const value = `${role}:${department}`;
    assert(previewRole.innerHTML.includes(`value="${value}"`), value + ' in preview');
    assert(context.roleOptions(role, department).includes(`value="${value}" selected`), value + ' remains selected');
  }
  assert(previewRole.innerHTML.includes('value="faculty"'), 'Preview keeps its existing Faculty route');
  assert(context.roleOptions('faculty').includes('value="teacher" selected'), 'Legacy faculty roles remain selected');
  assert(source.includes('roleOptions(user.requested_role)'), 'Pending approvals share the choices');
  assert(source.includes('roleOptions(currentRole, user.role_department)'), 'Approved users share the choices');
  assert(!html.includes('Student Records &amp; Academic Management'));
  assert(!html.includes('href="../staff/enrollment-requests.html"'));
  let change, sent, failed = false, reloads = 0;
  const select = { value: 'staff:Library', style: {}, getAttribute: () => 'test-user', addEventListener: (_, handler) => { change = handler; } };
  const cached = { id: 'test-user', role: 'staff', role_department: null };
  const saveContext = vm.createContext({
    approvedTableBody: { querySelectorAll: selector => selector.startsWith('.role-select') ? [select] : [] },
    allApprovedUsers: [cached], setTimeout() {}, alert() {},
    loadApprovedUsers() { reloads++; },
    callRpc: async (name, args) => { sent = { name, ...args }; return failed ? { message: 'offline' } : null; },
  });
  vm.runInContext(source.slice(source.indexOf('    function attachApprovedListeners()'), source.indexOf('    function escapeHtml(')), saveContext);
  saveContext.attachApprovedListeners();
  await change({ target: select });
  assert.equal(sent.name, 'set_user_role');
  assert.equal(sent.new_role, 'staff:Library');
  assert.equal(cached.role, 'staff');
  assert.equal(cached.role_department, 'Library');
  failed = true;
  select.value = 'dean:CCS';
  await change({ target: select });
  assert.equal(cached.role_department, 'Library', 'Failed saves retain the last saved department');
  assert.equal(reloads, 1, 'Failed saves reload the saved selection');
}
console.log('Admin roles: requested staff/dean choices in both menus, saved selection, legacy Faculty and removed links passed.');
