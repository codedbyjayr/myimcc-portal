import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./registrar-dashboard.js', import.meta.url), 'utf8');
const nodes = new Map();
const getEl = id => {
  if (!nodes.has(id)) nodes.set(id, { value: '', innerHTML: '', textContent: '' });
  return nodes.get(id);
};
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const html = (strings, ...values) => strings.reduce((result, part, index) => result + part + (index < values.length ? (Array.isArray(values[index]) ? values[index].join('') : values[index]?.__raw || escapeHtml(values[index])) : ''), '');
const raw = value => ({ __raw: value });
const profileName = '<img src=x onerror=alert(1)>';
let status = 'pending', filters = [], writes = [], toasts = [], confirmApproval = true;
const confirmations = [];
const row = { id: 'clearance-1', student_id: 'student-1', department_code: 'registrar', department_name: 'Registrar Office', status, note: 'Ready', profiles: { full_name: profileName, student_no: 'S-001', program: 'BSIT', year_level: '1st Year' } };
const context = vm.createContext({
  registrarClearances: [], registrarClearancesLoaded: false, selectedRegistrarStudentId: 'student-1', currentRole: 'registrar',
  getEl, html, raw, escapeHtml, announce() {}, pluralize: count => `${count} clearances`,
  window: { confirm: message => { confirmations.push(message); return confirmApproval; } },
  toast: (...args) => toasts.push(args), console,
  supabaseClient: {
    rpc: async name => {
      assert.equal(name, 'get_registrar_clearance_workspace');
      return { data: [{ ...row, status, clearances: [
        { department_code: 'dean', department_name: 'College Dean', status: 'cleared', note: 'Verified' },
        { department_code: 'registrar', department_name: 'Registrar Office', status, note: 'Ready' },
      ] }], error: null };
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
const start = source.indexOf('function renderRegistrarClearanceStudents()');
const end = source.indexOf('function selectStudent(', start);
vm.runInContext(source.slice(start, end), context);
await context.loadRegistrarClearances();
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
await context.approveRegistrarClearance(button);
assert.equal(writes.length, 1);
assert.equal(writes[0].status, 'cleared');
assert(writes[0].cleared_at);
assert.deepEqual(filters, [['id', row.id], ['student_id', row.student_id], ['department_code', 'registrar'], ['status', 'pending']]);
assert.equal(toasts.at(-1)[0], 'Registrar clearance approved.');
assert(!getEl('registrarClearanceDetails').innerHTML.includes('data-clearance-id='), 'Cleared rows cannot be approved again');
console.log('Registrar clearance: scoped queue, safe names, conditional approval, and repeat-action protection passed.');
