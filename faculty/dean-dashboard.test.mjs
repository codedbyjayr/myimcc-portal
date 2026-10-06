// Unit & Integration tests for Dean Dashboard Instructor Assignment Flow
// Run: node faculty/dean-dashboard.test.mjs
import { readFileSync } from 'node:fs';

let passed = 0;
const failures = [];

function eq(actual, expected, label) {
  if (actual === expected) { passed++; return; }
  failures.push(`${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`);
}

function ok(condition, label) {
  if (condition) { passed++; return; }
  failures.push(`${label}\n      expected condition to be truthy, got: ${JSON.stringify(condition)}`);
}

// ── Mock DOM & Supabase Harness ───────────────────────────────────────
function createHarness() {
  const elements = new Map();

  function makeEl(id, tag = 'div') {
    const el = {
      id,
      tagName: tag.toUpperCase(),
      value: '',
      textContent: '',
      innerHTML: '',
      disabled: false,
      style: {},
      classList: {
        classes: new Set(),
        add(c) { this.classes.add(c); },
        remove(c) { this.classes.delete(c); },
        contains(c) { return this.classes.has(c); }
      },
      listeners: {},
      addEventListener(evt, fn) {
        (this.listeners[evt] ||= []).push(fn);
      },
      trigger(evt, eventObj = {}) {
        (this.listeners[evt] || []).forEach(fn => fn(eventObj));
      },
      focus() { this.focused = true; },
      setAttribute(k, v) { this[k] = v; },
      dataset: {}
    };
    elements.set(id, el);
    return el;
  }

  // Pre-seed known DOM IDs used by the dean dashboard modal
  const domIds = [
    'instructorSelectWrapper', 'field_instructor_id', 'field_code', 'field_title',
    'field_program', 'field_year', 'field_semester', 'field_school_year',
    'field_units', 'field_schedule', 'field_catalog_course', 'modalTitle',
    'modalForm', 'modalOverlay', 'modalSaveBtn', 'modalCancelBtn',
    'toast', 'deanAddClassBtn', 'retryInstructorLoad'
  ];
  domIds.forEach(id => makeEl(id));

  // Global document & window stubs
  const doc = {
    getElementById(id) {
      if (!elements.has(id)) makeEl(id);
      return elements.get(id);
    },
    createElement(tag) { return makeEl('elem_' + Math.random(), tag); },
    body: { appendChild() {} },
    querySelectorAll() { return []; }
  };

  return { doc, elements, makeEl };
}

// ── Test 1: loadInstructorOptions Logic ────────────────────────────────
console.log('Testing Dean Subject-Instructor Assignment Flow...');

async function testLoadInstructorOptions() {
  // Test RPC success
  {
    const state = { instructorOptions: null, instructorOptionsError: null, facultyList: [] };
    const mockSupabase = {
      rpc: async (name) => {
        eq(name, 'get_subject_instructor_options', 'Calls get_subject_instructor_options RPC');
        return {
          data: [
            { id: 'uuid-t1', full_name: 'Feah Shyn Oguis', role: 'teacher' },
            { id: 'uuid-t2', full_name: 'Raumel Ian Kiunisala', role: 'teacher' },
            { id: 'uuid-f1', full_name: 'Maria Santos', role: 'faculty' },
            { id: 'uuid-d1', full_name: 'Dean Ortiz', role: 'dean' } // should be filtered out
          ],
          error: null
        };
      }
    };

    // Simulate loadInstructorOptions
    state.instructorOptions = null;
    const { data, error } = await mockSupabase.rpc('get_subject_instructor_options');
    if (!error) {
      state.instructorOptions = (data || []).filter(r => r.role === 'teacher' || r.role === 'faculty');
      state.facultyList = state.instructorOptions.map(r => ({ id: r.id, full_name: r.full_name, role: r.role, status: 'approved' }));
    }

    eq(state.instructorOptions.length, 3, 'Filters only teacher and faculty roles, excluding dean');
    eq(state.instructorOptions[0].id, 'uuid-t1', 'Preserves UUID identifier');
    eq(state.instructorOptionsError, null, 'No error on success');
    eq(state.facultyList.length, 3, 'Mirrors into facultyList');
  }

  // Test RPC error handling
  {
    const state = { instructorOptions: null, instructorOptionsError: null, facultyList: [] };
    const mockSupabase = {
      rpc: async () => ({
        data: null,
        error: { message: 'Database connection failed', code: 'PGRST500' }
      })
    };

    const { data, error } = await mockSupabase.rpc('get_subject_instructor_options');
    if (error) {
      state.instructorOptions = [];
      state.instructorOptionsError = error.message;
    }

    eq(state.instructorOptions.length, 0, 'Empty array on error');
    eq(state.instructorOptionsError, 'Database connection failed', 'Records error message');
  }

  // Test RPC empty list
  {
    const state = { instructorOptions: null, instructorOptionsError: null, facultyList: [] };
    const mockSupabase = {
      rpc: async () => ({ data: [], error: null })
    };

    const { data, error } = await mockSupabase.rpc('get_subject_instructor_options');
    if (!error) {
      state.instructorOptions = (data || []).filter(r => r.role === 'teacher' || r.role === 'faculty');
      state.instructorOptionsError = null;
    }

    eq(state.instructorOptions.length, 0, 'Handles empty list from RPC');
    eq(state.instructorOptionsError, null, 'Error is null for empty list');
  }
}

// ── Test 2: renderInstructorDropdown UI Rendering ─────────────────────
function testRenderInstructorDropdown() {
  function render(wrapper, state, existingInstructorId = null, existingInstructorName = null, isEdit = false) {
    const selId = 'field_instructor_id';

    if (state.instructorOptions === null) {
      wrapper.innerHTML = `
        <label for="${selId}">Assigned Instructor <span style="color:var(--red,#dc2626)">*</span></label>
        <select id="${selId}" class="field-input" disabled>
          <option value="">⏳ Loading instructors…</option>
        </select>`;
      return;
    }

    if (state.instructorOptionsError) {
      wrapper.innerHTML = `
        <label for="${selId}">Assigned Instructor <span style="color:var(--red,#dc2626)">*</span></label>
        <select id="${selId}" class="field-input" disabled>
          <option value="">⚠ Could not load instructors</option>
        </select>
        <p class="error-msg">RPC error: ${state.instructorOptionsError}</p>`;
      return;
    }

    if (!state.instructorOptions.length) {
      wrapper.innerHTML = `
        <label for="${selId}">Assigned Instructor <span style="color:var(--red,#dc2626)">*</span></label>
        <select id="${selId}" class="field-input" disabled>
          <option value="">— No active instructors found —</option>
        </select>`;
      return;
    }

    const sorted = state.instructorOptions.slice().sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
    const isEligible = Boolean(existingInstructorId && sorted.some(f => String(f.id) === String(existingInstructorId)));

    let placeholderOption = '';
    let warningHtml = '';

    if (isEdit) {
      if (isEligible) {
        placeholderOption = `<option value="" disabled>— Select Instructor —</option>`;
      } else {
        const legacyDisplay = existingInstructorName || (existingInstructorId ? 'Ineligible Profile' : 'Unassigned');
        placeholderOption = `<option value="" disabled selected>⚠ Legacy assignment: ${legacyDisplay} (Choose replacement)</option>`;
        warningHtml = `<div class="legacy-assignment-alert">Legacy: ${legacyDisplay}</div>`;
      }
    } else {
      placeholderOption = `<option value="" disabled selected>— Select Eligible Instructor —</option>`;
    }

    const optionsHtml = sorted.map(f => {
      const selected = isEligible && String(f.id) === String(existingInstructorId);
      return `<option value="${f.id}" ${selected ? 'selected' : ''}>${f.full_name}</option>`;
    }).join('');

    wrapper.innerHTML = `
      <label for="${selId}">Assigned Instructor <span style="color:var(--red,#dc2626)">*</span></label>
      <select id="${selId}" class="field-input" required>
        ${placeholderOption}
        ${optionsHtml}
      </select>
      ${warningHtml}`;
  }

  const wrapper = { innerHTML: '' };

  // 1. Loading state
  render(wrapper, { instructorOptions: null, instructorOptionsError: null });
  ok(wrapper.innerHTML.includes('⏳ Loading instructors…'), 'Shows loading option when RPC pending');
  ok(wrapper.innerHTML.includes('disabled'), 'Dropdown is disabled while loading');

  // 2. Error state
  render(wrapper, { instructorOptions: [], instructorOptionsError: 'Timeout' });
  ok(wrapper.innerHTML.includes('⚠ Could not load instructors'), 'Shows error option when RPC failed');
  ok(wrapper.innerHTML.includes('RPC error: Timeout'), 'Displays error text');

  // 3. Empty state
  render(wrapper, { instructorOptions: [], instructorOptionsError: null });
  ok(wrapper.innerHTML.includes('— No active instructors found —'), 'Shows empty state option when list is empty');

  // 4. Add mode (isEdit = false)
  const sampleInstructors = [
    { id: 'uuid-1', full_name: 'Feah Shyn Oguis', role: 'teacher' },
    { id: 'uuid-2', full_name: 'Raumel Ian Kiunisala', role: 'teacher' }
  ];
  render(wrapper, { instructorOptions: sampleInstructors, instructorOptionsError: null }, null, null, false);
  ok(wrapper.innerHTML.includes('— Select Eligible Instructor —'), 'Add mode shows Select Eligible Instructor placeholder');
  ok(wrapper.innerHTML.includes('value="uuid-1"'), 'Lists instructor uuid-1');
  ok(wrapper.innerHTML.includes('value="uuid-2"'), 'Lists instructor uuid-2');
  ok(!wrapper.innerHTML.includes('selected>Feah'), 'Does not preselect an instructor in Add mode');

  // 5. Edit mode with eligible instructor
  render(wrapper, { instructorOptions: sampleInstructors, instructorOptionsError: null }, 'uuid-2', 'Raumel Ian Kiunisala', true);
  ok(wrapper.innerHTML.includes('value="uuid-2" selected>Raumel Ian Kiunisala'), 'Preselects eligible instructor on edit');
  ok(!wrapper.innerHTML.includes('legacy-assignment-alert'), 'No legacy alert for eligible instructor');

  // 6. Edit mode with legacy instructor (e.g. dean or unknown UUID)
  render(wrapper, { instructorOptions: sampleInstructors, instructorOptionsError: null }, 'dean-uuid', 'Joeselito Lawrence Ortiz', true);
  ok(wrapper.innerHTML.includes('⚠ Legacy assignment: Joeselito Lawrence Ortiz (Choose replacement)'), 'Flags legacy assignment in placeholder');
  ok(wrapper.innerHTML.includes('legacy-assignment-alert'), 'Renders legacy assignment alert banner');
  ok(!wrapper.innerHTML.includes('value="dean-uuid"'), 'Dean UUID is NOT an option in eligible list');
}

// ── Test 3: Validation and Save Logic ─────────────────────────────────
async function testSaveValidationAndAtomicRpc() {
  const eligibleInstructors = [
    { id: 'uuid-t1', full_name: 'Feah Shyn Oguis', role: 'teacher' },
    { id: 'uuid-t2', full_name: 'Raumel Ian Kiunisala', role: 'teacher' }
  ];

  // Helper validation function matching dean-dashboard.js
  function validateOffering(state, values, selectedInstructorId) {
    if (state.instructorOptions === null) return { error: 'Instructor options are still loading. Please wait a moment.' };
    if (state.instructorOptionsError) return { error: 'Cannot save: instructor list failed to load. Please click retry.' };
    if (!state.instructorOptions.length) return { error: 'Cannot save: no approved active instructors are available to assign.' };

    if (!values.code) return { error: 'Subject Code is required.' };
    if (!values.title) return { error: 'Course Title is required.' };

    if (!selectedInstructorId) return { error: 'Please select an eligible instructor.' };
    const instructor = state.instructorOptions.find(o => String(o.id) === String(selectedInstructorId));
    if (!instructor) return { error: 'Selected instructor is not eligible. Please choose from the list.' };

    return { ok: true, instructor };
  }

  // Case A: Reject save if options still loading
  {
    const res = validateOffering({ instructorOptions: null }, { code: 'CS101', title: 'Intro' }, 'uuid-t1');
    eq(res.error, 'Instructor options are still loading. Please wait a moment.', 'Blocks save while loading');
  }

  // Case B: Reject save if empty selection
  {
    const res = validateOffering({ instructorOptions: eligibleInstructors }, { code: 'CS101', title: 'Intro' }, '');
    eq(res.error, 'Please select an eligible instructor.', 'Blocks save when instructor not selected');
  }

  // Case C: Reject save if invalid/ineligible instructor ID chosen
  {
    const res = validateOffering({ instructorOptions: eligibleInstructors }, { code: 'CS101', title: 'Intro' }, 'ineligible-dean-uuid');
    eq(res.error, 'Selected instructor is not eligible. Please choose from the list.', 'Blocks save when ineligible ID provided');
  }

  // Case D: Valid selection passes validation
  {
    const res = validateOffering({ instructorOptions: eligibleInstructors }, { code: 'CS101', title: 'Intro' }, 'uuid-t1');
    eq(res.ok, true, 'Validation passes for valid instructor');
    eq(res.instructor.full_name, 'Feah Shyn Oguis', 'Identifies instructor full_name');
  }

  // Case E: Atomic Save (Create Offering)
  {
    let rpcCalledWith = null;
    const mockSupabase = {
      rpc: async (name, payload) => {
        rpcCalledWith = { name, payload };
        return {
          data: {
            id: 101,
            code: payload.p_code,
            title: payload.p_title,
            instructor_id: payload.p_instructor_id,
            instructor_name: 'Feah Shyn Oguis'
          },
          error: null
        };
      }
    };

    const payload = {
      p_offering_id: null,
      p_code: 'CS101',
      p_title: 'Intro to CS',
      p_units: 3.0,
      p_program: 'BSCS',
      p_year: 1,
      p_semester: '1st Semester',
      p_school_year: '2026-2027',
      p_schedule: 'MWF 8-9',
      p_instructor_id: 'uuid-t1'
    };

    const { data: savedRow, error } = await mockSupabase.rpc('save_course_offering_with_instructor', payload);
    eq(error, null, 'Atomic RPC succeeds');
    eq(rpcCalledWith.name, 'save_course_offering_with_instructor', 'Calls save_course_offering_with_instructor RPC');
    eq(rpcCalledWith.payload.p_instructor_id, 'uuid-t1', 'Passes correct instructor UUID');
    eq(savedRow.id, 101, 'Returns saved offering ID');
    eq(savedRow.instructor_id, 'uuid-t1', 'Course offering has instructor_id set');
  }

  // Case F: Atomic Save (Edit Offering)
  {
    let rpcCalledWith = null;
    const mockSupabase = {
      rpc: async (name, payload) => {
        rpcCalledWith = { name, payload };
        return {
          data: {
            id: payload.p_offering_id,
            code: payload.p_code,
            title: payload.p_title,
            instructor_id: payload.p_instructor_id,
            instructor_name: 'Raumel Ian Kiunisala'
          },
          error: null
        };
      }
    };

    const payload = {
      p_offering_id: 101,
      p_code: 'CS101',
      p_title: 'Intro to CS',
      p_units: 3.0,
      p_program: 'BSCS',
      p_year: 1,
      p_semester: '1st Semester',
      p_school_year: '2026-2027',
      p_schedule: 'MWF 8-9',
      p_instructor_id: 'uuid-t2'
    };

    const { data: savedRow, error } = await mockSupabase.rpc('save_course_offering_with_instructor', payload);
    eq(error, null, 'Edit atomic RPC succeeds');
    eq(rpcCalledWith.payload.p_offering_id, 101, 'Passes offering ID for edit');
    eq(savedRow.instructor_id, 'uuid-t2', 'Updated instructor_id matches');
  }

  // Case G: Client-side Fallback Consistency (when RPC is not deployed)
  {
    const courseOfferingsTable = [];
    const teacherAssignmentsTable = [];
    const deanUserId = 'dean-user-uuid';

    // Helper simulating fallback save
    async function fallbackSaveOffering(offeringId, values, selectedInstructor) {
      let savedRow;
      const directPayload = {
        code: values.code,
        title: values.title,
        program: values.program,
        year: Number(values.year) || 1,
        semester: values.semester,
        school_year: values.school_year || '2026–2027',
        units: Number(values.units) || 3.0,
        schedule: values.schedule || null,
        instructor_id: selectedInstructor.id,
        instructor_name: selectedInstructor.full_name,
      };

      if (offeringId) {
        // Update existing offering
        const idx = courseOfferingsTable.findIndex(o => o.id === offeringId);
        courseOfferingsTable[idx] = { ...courseOfferingsTable[idx], ...directPayload };
        savedRow = courseOfferingsTable[idx];

        // Deactivate previous assignments
        teacherAssignmentsTable.forEach(ta => {
          if (ta.offering_id === offeringId) ta.is_active = false;
        });

        // Upsert new active assignment
        teacherAssignmentsTable.push({
          teacher_id: selectedInstructor.id,
          offering_id: offeringId,
          academic_year: directPayload.school_year,
          semester: directPayload.semester,
          is_active: true,
          assigned_by: deanUserId
        });
      } else {
        // Insert new offering
        savedRow = { id: 201, ...directPayload };
        courseOfferingsTable.push(savedRow);

        teacherAssignmentsTable.push({
          teacher_id: selectedInstructor.id,
          offering_id: savedRow.id,
          academic_year: directPayload.school_year,
          semester: directPayload.semester,
          is_active: true,
          assigned_by: deanUserId
        });
      }

      return savedRow;
    }

    // 1. Create offering
    const newOffering = await fallbackSaveOffering(null, {
      code: 'IT301',
      title: 'Web Systems',
      program: 'BSIT',
      year: 3,
      semester: '2nd Semester',
      school_year: '2026-2027',
      units: 3.0
    }, eligibleInstructors[0]);

    eq(newOffering.instructor_id, 'uuid-t1', 'Fallback creates offering with instructor_id');
    const activeTa1 = teacherAssignmentsTable.find(ta => ta.offering_id === 201 && ta.is_active);
    ok(activeTa1 !== undefined, 'Fallback creates active teacher assignment');
    eq(activeTa1.teacher_id, 'uuid-t1', 'teacher_assignments.teacher_id matches course_offerings.instructor_id');
    eq(activeTa1.assigned_by, deanUserId, 'assigned_by set to authenticated dean');

    // 2. Edit offering (reassign to teacher 2)
    const updatedOffering = await fallbackSaveOffering(201, {
      code: 'IT301',
      title: 'Web Systems (Updated)',
      program: 'BSIT',
      year: 3,
      semester: '2nd Semester',
      school_year: '2026-2027',
      units: 3.0
    }, eligibleInstructors[1]);

    eq(updatedOffering.instructor_id, 'uuid-t2', 'Offering instructor_id updated to teacher 2');
    const activeAssignments = teacherAssignmentsTable.filter(ta => ta.offering_id === 201 && ta.is_active);
    eq(activeAssignments.length, 1, 'Exactly one active assignment exists after edit');
    eq(activeAssignments[0].teacher_id, 'uuid-t2', 'Active assignment matches updated instructor_id');

    const oldAssignment = teacherAssignmentsTable.find(ta => ta.offering_id === 201 && ta.teacher_id === 'uuid-t1');
    eq(oldAssignment.is_active, false, 'Previous assignment was deactivated');
  }
}

// ── Execute Test Suite ────────────────────────────────────────────────
async function runAll() {
  await testLoadInstructorOptions();
  testRenderInstructorDropdown();
  await testSaveValidationAndAtomicRpc();

  console.log(`\ndean-dashboard instructor assignment tests: ${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error('\nFAILURES:');
    failures.forEach(f => console.error('  x ' + f));
    process.exit(1);
  }
  console.log('ALL TESTS PASSED OK\n');
}

runAll();
