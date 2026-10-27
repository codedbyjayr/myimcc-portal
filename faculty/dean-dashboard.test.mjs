import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('./dean-dashboard.js', import.meta.url), 'utf8');
const nodes = new Map(), calls = [], toasts = [];
let save, error = null;
const values = { code: 'SUM101', title: 'Summer Subject', units: '3', program: 'BSIT', year: '1', semester: 'Summer', school_year: '2026-2027', schedule: '', instructor_id: '' };
for (const [key, value] of Object.entries(values)) nodes.set('field_' + key, { value, focus() {} });
nodes.set('modalSaveBtn', { textContent: 'Save', addEventListener(_, handler) { save = handler; } });
nodes.set('instructorSelectWrapper', { innerHTML: '' });
const state = { instructorOptions: [], instructorOptionsError: null };
const context = vm.createContext({
  state, currentUserId: 'dean', editingOfferingId: null, activeModalKey: 'courseOffering',
  getEl: id => nodes.get(id), escapeHtml: value => String(value).replaceAll('<', '&lt;'),
  showToast: (...args) => toasts.push(args), closeModal() {}, console,
  modalConfigs: { courseOffering: { fields: Object.keys(values).filter(k => k !== 'instructor_id').map(name => ({ name, type: name === 'units' ? 'number' : 'text', required: name !== 'schedule' })) } },
  supabaseClient: { rpc: async (name, payload) => { calls.push({ name, payload }); return { data: { id: 1 }, error }; } },
});
vm.runInContext(source.slice(source.indexOf('    function renderInstructorDropdown('), source.indexOf('    function openModal(')), context);
vm.runInContext('renderInstructorDropdown()', context);
assert(nodes.get('instructorSelectWrapper').innerHTML.includes('Unassigned'));
assert(!nodes.get('instructorSelectWrapper').innerHTML.includes(' required'));
state.instructorOptionsError = 'Offline';
vm.runInContext('renderInstructorDropdown()', context);
assert(nodes.get('instructorSelectWrapper').innerHTML.includes('Save as unassigned'));
const start = source.indexOf("    getEl('modalSaveBtn').addEventListener('click'");
vm.runInContext(source.slice(start, source.indexOf('    // ── Quick Links', start)), context);
await save();
assert.equal(calls[0].name, 'save_course_offering_with_instructor');
assert.equal(calls[0].payload.p_instructor_id, null, 'An empty or unavailable instructor list must not prevent an unassigned save');
assert.equal(calls[0].payload.p_semester, 'Summer');
nodes.get('field_instructor_id').value = 'unknown';
await save();
assert.equal(calls.length, 1, 'A selected instructor must still be eligible');
nodes.get('field_instructor_id').value = '';
nodes.get('field_units').value = '0';
await save();
assert.equal(calls.length, 1, 'Zero units must not silently become three units');
nodes.get('field_units').value = '3';
error = { message: 'Database rejected offering' };
await save();
assert.equal(toasts.at(-1)[1], true);
assert.equal(nodes.get('modalSaveBtn').disabled, false);
assert.equal(nodes.get('modalSaveBtn').textContent, 'Save');
console.log('Dean subject form: actual optional-instructor handler, Summer, invalid selection/units, and save failure passed.');
