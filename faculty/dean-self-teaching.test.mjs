import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('./dean-dashboard.js', import.meta.url), 'utf8');
const nodes = new Map();
const getEl = id => { if (!nodes.has(id)) nodes.set(id, { innerHTML: '', style: {} }); return nodes.get(id); };
const state = { instructorOptions: null, facultyList: [], offerings: [{ id: 1, code: 'TEST', instructor_id: 'self', instructor_name: 'Demo Dean' }] };
const context = vm.createContext({
  currentUserId: 'self', currentProfile: { id: 'self', role: 'dean', status: 'approved' }, state, getEl, console,
  escapeHtml: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
  supabaseClient: { rpc: async () => ({ data: [
    { id: 'teacher', full_name: 'Demo Teacher', role: 'teacher' },
    { id: 'self', full_name: 'Demo Dean', role: 'dean' },
    { id: 'other', full_name: 'Other Dean', role: 'dean' },
  ] }) },
  document: { querySelectorAll: () => [] }, offeringsForSelectedTerm: () => state.offerings,
});
vm.runInContext(source.slice(source.indexOf('    async function loadInstructorOptions('), source.indexOf('    async function loadAllData(')), context);
vm.runInContext(source.slice(source.indexOf('    function renderInstructorDropdown('), source.indexOf('    function openModal(')), context);
vm.runInContext(source.slice(source.indexOf('    function renderAssignments('), source.indexOf('    async function deleteOffering(')), context);
await vm.runInContext('loadInstructorOptions()', context);
assert.deepEqual(Array.from(state.instructorOptions, p => p.id), ['teacher', 'self']);
assert.deepEqual(Array.from(state.facultyList, p => p.id), ['teacher', 'self']);
vm.runInContext('renderInstructorDropdown()', context);
assert(getEl('instructorSelectWrapper').innerHTML.includes('Demo Dean (You — Dean)'));
vm.runInContext("renderInstructorDropdown('self', 'Demo Dean', true)", context);
assert(getEl('instructorSelectWrapper').innerHTML.includes('value="self" selected'));
assert(!getEl('instructorSelectWrapper').innerHTML.includes('legacy-assignment-alert'));
vm.runInContext('renderAssignments()', context);
assert(getEl('assignBody').innerHTML.includes('Demo Dean (You)'));
assert(!getEl('assignBody').innerHTML.includes('Other Dean'));

// Reproduce startup: profiles only expose the dean; the instructor RPC arrives later.
const start = source.indexOf('    async function loadAllData(');
vm.runInContext(source.slice(start, source.indexOf('    // ═', start)), context);
state.instructorOptions = null;
let release;
context.supabaseClient.rpc = name => name === 'get_dean_student_directory' ? Promise.resolve({ data: [] }) : new Promise(resolve => { release = resolve; });
context.supabaseClient.from = table => ({
  select() { return this; }, eq() { return this; }, order() { return this; },
  then(resolve, reject) { return Promise.resolve({ data: table === 'profiles' ? [{ id: 'self', full_name: 'Demo Dean', role: 'dean', status: 'approved' }] : table === 'course_offerings' ? state.offerings : [] }).then(resolve, reject); },
});
let loaded = false;
const loading = vm.runInContext('loadAllData()', context).then(() => { loaded = true; });
await new Promise(resolve => setImmediate(resolve));
assert.equal(loaded, false, 'Startup must wait for the delayed instructor list');
release({ data: [{ id: 'teacher', full_name: 'Demo Teacher', role: 'teacher' }, { id: 'self', full_name: 'Demo Dean', role: 'dean' }] });
await loading;
vm.runInContext('renderAssignments()', context);
assert(getEl('assignBody').innerHTML.includes('Demo Teacher'), 'Teacher appears on first assignment render without opening Edit');
assert(getEl('assignBody').innerHTML.includes('Demo Dean (You)'));
console.log('Dean instructors: self-teaching, add/edit, and delayed startup assignment dropdown passed');
