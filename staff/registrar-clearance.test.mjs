import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadDashboardView } from '../scripts/dashboard-markup.mjs';

const source = readFileSync(new URL('./registrar-dashboard.js', import.meta.url), 'utf8');
const { RegistrarClearanceQueue, RegistrarClearanceDetails } = await loadDashboardView(new URL('./registrar-dashboard-view.tsx', import.meta.url));
const nodes = new Map();
const getEl = id => {
  if (!nodes.has(id)) nodes.set(id, { value: '', innerHTML: '', textContent: '' });
  return nodes.get(id);
};
const profileName = '<img src=x onerror=alert(1)>';
let status = 'pending', filters = [], writes = [], toasts = [], confirmApproval = true, failRefresh = true;
const confirmations = [];
const row = { id: 'clearance-1', student_id: 'student-1', department_code: 'registrar', department_name: 'Registrar Office', status, note: 'Ready', profiles: { full_name: profileName, student_no: 'S-001', program: 'BSIT', year_level: '1st Year' } };
const others = Array.from({ length: 1000 }, (_, i) => ({ ...row, id: `extra-${i}`, student_id: `student-extra-${i}`, profiles: { full_name: `Extra student ${i}` } }));
const context = vm.createContext({
  registrarClearances: [], registrarClearancesLoaded: false, selectedRegistrarStudentId: 'student-1', currentRole: 'registrar',
  clearanceLoadVersion: 0, savingClearances: new Set(),
  getEl, document: { currentScript: null }, announce() {}, pluralize: count => `${count} clearances`,
  window: {
    renderRegistrarClearanceQueue: props => renderToStaticMarkup(createElement(RegistrarClearanceQueue, props)),
    renderRegistrarClearanceDetails: props => renderToStaticMarkup(createElement(RegistrarClearanceDetails, props)),
  },
  confirmRegistrarClearance: name => { confirmations.push('Registrar requirement for ' + name); return confirmApproval; },
  toast: (...args) => toasts.push(args), console,
  supabaseClient: {
    rpc: (name, args, options) => {
      assert.equal(name, 'get_registrar_clearance_workspace');
      assert.equal(options.get, true);
      const rows = [{ ...row, status, clearances: [
        { department_code: 'dean', department_name: 'College Dean', status: 'cleared', note: 'Verified' },
        { department_code: 'registrar', department_name: 'Registrar Office', status, note: 'Ready' },
      ] }, ...others];
      return {
        order(column) { assert.equal(column, 'id'); return this; },
        async range(from, to) {
          return failRefresh && from >= 500 ? { error: { message: 'offline' } } : { data: rows.slice(from, to + 1), error: null };
        },
      };
    },
    from: name => {
      assert.equal(name, 'clearances');
      return {
        update(value) { writes.push(value); return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        select() { return this; },
        async single() { status = 'cleared'; return { data: { id: row.id }, error: null }; },
      };
    },
  },
});
vm.runInContext(readFileSync(new URL('../shared/identity.js', import.meta.url), 'utf8'), context);
context.IMCC = context.window.IMCC;
const start = source.indexOf('function renderRegistrarClearanceStudents()');
const end = source.indexOf('function confirmRegistrarClearance(', start);
vm.runInContext(source.slice(start, end), context);
await assert.rejects(context.loadRegistrarClearances(), /offline/);
getEl('registrarClearanceSearch').value = 'Extra student 999';
context.renderRegistrarClearanceStudents();
assert.equal(getEl('registrarClearanceStudents').textContent, 'Could not load Registrar clearances.');
assert.equal(getEl('registrarClearanceStudents').innerHTML, '', 'A partial list is never shown as complete');
failRefresh = false;
await context.loadRegistrarClearances();
assert.match(getEl('registrarClearanceStudents').innerHTML, /Extra student 999/, 'Search finds a student beyond the first 1,000 records');
getEl('registrarClearanceSearch').value = '';
context.renderRegistrarClearanceStudents();
assert(!getEl('registrarClearanceStudents').innerHTML.includes('<img'), 'Student names are escaped in the picker');
assert.match(getEl('registrarClearanceDetails').innerHTML, /College Dean/,'Details show the other offices like the Dean view');
assert.match(getEl('registrarClearanceDetails').innerHTML, /data-clearance-id="clearance-1"/);
confirmApproval = false;
const button = { disabled: false, dataset: { clearanceId: row.id } };
await context.approveRegistrarClearance(button);
assert.equal(writes.length, 0, 'Canceling confirmation prevents Registrar approval');
assert.equal(button.disabled, false, 'Canceling leaves approval available');
assert.match(confirmations[0], /Registrar requirement for/);
confirmApproval = true;
failRefresh = true;
await context.approveRegistrarClearance(button);
assert.equal(writes.length, 1);
assert.equal(writes[0].status, 'cleared');
assert(writes[0].cleared_at);
assert.deepEqual(filters, [['id', row.id], ['student_id', row.student_id], ['department_code', 'registrar'], ['status', 'pending']]);
assert.equal(toasts.at(-1)[0], 'Registrar clearance approved.');
assert(!getEl('registrarClearanceDetails').innerHTML.includes('data-clearance-id='), 'Cleared rows cannot be approved again');
assert.match(getEl('registrarClearanceLoadError').textContent, /Clearance saved.*retry/);
failRefresh = false;
await context.loadRegistrarClearances();
assert.equal(getEl('registrarClearanceLoadError').textContent, '');
console.log('Registrar clearance: scoped queue, safe names, conditional approval, and repeat-action protection passed.');
