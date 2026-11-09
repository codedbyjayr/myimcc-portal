import { dashboardMarkup } from '../scripts/dashboard-markup.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

for (const root of ['', '../review-assets/admin/']) {
  const source = readFileSync(new URL(root + 'admin-dashboard.js', import.meta.url), 'utf8');
  const html = await dashboardMarkup(new URL(root + 'admin-dashboard.html', import.meta.url));
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
  assert(!html.includes('Student Records &amp; Academic Management'));
  assert(!html.includes('href="../staff/enrollment-requests.html"'));
  let change, click, release;
  const writes = [], roleSaveStatus = {}, roleDrafts = new Map(), savingRoles = new Set();
  const save = { disabled: true, addEventListener: (_, handler) => { click = handler; } };
  const select = {
    value: 'staff:Library', dataset: { roleUserId: 'test-user' },
    closest: () => ({ querySelector: () => save }),
    addEventListener: (_, handler) => { change = handler; },
  };
  const cached = { id: 'test-user', role: 'staff', role_department: null };
  const saveContext = vm.createContext({
    approvedTableBody: { querySelectorAll: selector => selector === '[data-role-user-id]' ? [select] : [] },
    allApprovedUsers: [cached], currentAdminId: 'self', roleDrafts, savingRoles, changingAccess: new Set(), roleValue: context.roleValue,
    roleSaveStatus, filterUsers: users => users, renderApprovedTable() {},
    callRpc: (name, args) => {
      writes.push({ name, ...args });
      return new Promise(resolve => { release = resolve; });
    },
  });
  vm.runInContext(source.slice(source.indexOf('    function attachApprovedListeners()'), source.indexOf('    const accessDialog =')), saveContext);
  saveContext.attachApprovedListeners();
  change();
  assert.equal(writes.length, 0, 'Selecting a role never writes');
  assert.equal(save.disabled, false);
  const firstSave = click();
  assert.equal(select.disabled, true);
  assert.equal(save.disabled, true);
  await click();
  assert.equal(writes.length, 1, 'Only one save per account can run at once');
  assert.equal(writes[0].name, 'set_user_role');
  assert.equal(writes[0].new_role, 'staff:Library');
  release(null);
  await firstSave;
  assert.equal(roleSaveStatus.textContent, 'Role saved.');
  assert.equal(cached.role, 'staff');
  assert.equal(cached.role_department, 'Library');
  assert.equal(roleDrafts.size, 0);
  select.value = 'dean:CCS';
  change();
  const failedSave = click();
  release({ message: 'offline' });
  await failedSave;
  assert.equal(cached.role_department, 'Library', 'Failed saves retain the last saved department');
  assert.equal(roleDrafts.get('test-user'), 'dean:CCS', 'Failed saves keep the draft for retry');
  assert.equal(savingRoles.size, 0);
  assert.match(roleSaveStatus.textContent, /offline/);
  select.value = 'staff:Library';
  change();
  assert.equal(save.disabled, true, 'Returning to the saved role clears the draft');
}
console.log('Admin roles: explicit save, duplicate protection, failed-save drafts, and role choices passed.');
