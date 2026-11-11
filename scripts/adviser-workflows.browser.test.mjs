import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { server } from './test-portal.mjs';
process.env.TEST_PORTAL_UNTIL = new Date(Date.now() + 3600000).toISOString();
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sdk = await readFile(new URL('../node_modules/@supabase/supabase-js/dist/umd/supabase.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir(new URL('../.temp/adviser-layout/', import.meta.url), { recursive: true });
let role = 'dean', active = true, enrollmentLocked = false, gradesLocked = false, failDashboard = false, failEnrollmentFees = false;
const writes = [], errors = [];
const clearanceNote = 'Submit the signed advising form.\nBring your current registration slip.';
const studentRequests = [];
const students = Array.from({ length: 40 }, (_, i) => ({ id: `student-${i}`, student_no: `TEST-${i}`, full_name: `Student ${i}`, role: 'student', status: 'approved', is_active: i !== 2, program: 'BSIT', year_level: '1st Year' }));
const offerings = [
  { id: 1, code: 'SUM101', title: 'Summer Subject', year: 1, semester: 'Summer' },
  { id: 2, code: 'FIRST101', title: 'First Semester Subject', year: 2, semester: '1st Semester' },
].map(o => ({ ...o, units: 3, program: 'BSIT', school_year: '2026-2027', instructor_id: 'teacher', instructor_name: 'Teacher Tester', enrollment_open: true, schedule: 'MWF 09:00-10:00' }));
const registrarOffers = offerings.map(o => ({ id: 'enrollment-' + o.id, student_id: students[0].id, offering_id: o.id, status: 'enrolled', course_offerings: o }));
let failOfferRefresh = false;
let failProspectusRefresh = false, publishedSummer;
const record = { profile: students[0], clearances: [
  { id: 'dean-clearance', department_code: 'dean', department_name: 'Dean', status: 'action_required', note: 'Awaiting review' },
], enrollments: [{ ...offerings[0], status: 'enrolled' }], grades: [
  { ...offerings[0], grade_scale: 'school', final: 1.5, equivalent: 2.75, remark: 'Passed' },
  { ...offerings[1], grade_scale: 'percentage', final: 94, equivalent: 1.25, remark: 'Passed' },
], attendance: [], transactions: [], installments: [], semesters: [], billing: null };
const registrarClearance = { id: 'registrar-clearance', student_id: 'student-0', department_code: 'registrar',
  department_name: 'Registrar', status: 'pending', note: null, profiles: students[0] };
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(10000);
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.hostname === 'cdn.jsdelivr.net') return route.fulfill({ contentType: 'text/javascript', body: sdk });
  if (url.origin === origin && url.pathname === '/shared/supabase-config.js') return route.fulfill({ contentType: 'text/javascript', body: `
    const client = supabase.createClient('https://adviser-test.invalid', 'test-key', { auth: { persistSession: false, autoRefreshToken: false } });
    client.auth.getUser = async () => ({ data: { user: { id: '${role}', email: '${role}@example.invalid' } } });
    client.auth.getSession = async () => ({ data: { session: null } });
    client.auth.onAuthStateChange = () => ({ data: { subscription: { unsubscribe() {} } } });
    client.channel = () => ({ on() { return this; }, subscribe() { return this; } });
    window.supabaseClient = window.__myimcc_supabase_client__ = client;
    window.getSupabaseClientAsync = async () => client;` });
  if (url.hostname === 'adviser-test.invalid') {
    const table = url.pathname.split('/').pop();
    if (failDashboard && table === 'grades') return route.fulfill({ status: 503, json: { message: 'Reports unavailable' } });
    if (failEnrollmentFees && table === 'misc_fees') return route.fulfill({ status: 503, json: { message: 'Fees unavailable' } });
    const object = request.headers().accept?.includes('object+json');
    let data = [];
    const readRpc = ['get_class_roster', 'get_subject_instructor_options', 'list_student_records', 'get_student_record', 'get_enrollment_workspace', 'list_enrollment_request_history', 'helpdesk_recipient_id'].includes(table);
    if (request.method() !== 'GET' && request.method() !== 'HEAD' && !readRpc) {
      const payload = request.postDataJSON(); writes.push({ table, payload });
      if (table === 'clearances') {
        assert.equal(request.method(), 'PATCH');
        assert.equal(url.searchParams.get('student_id'), 'eq.student-0');
        if (role === 'registrar') {
          assert.equal(url.searchParams.get('id'), 'eq.registrar-clearance');
          assert.equal(url.searchParams.get('department_code'), 'eq.registrar');
          assert.equal(url.searchParams.get('status'), 'eq.pending');
          assert.equal(url.searchParams.get('note'), 'is.null');
          assert.deepEqual(payload, { note: 'Submit your birth certificate.' });
          registrarClearance.note = payload.note;
          const row = { note: registrarClearance.note };
          return route.fulfill({ json: object ? row : [row] });
        }
        assert.equal(url.searchParams.get('id'), 'eq.dean-clearance');
        assert.equal(url.searchParams.get('department_code'), 'eq.dean');
        assert.equal(url.searchParams.get('status'), 'eq.action_required');
        if ('note' in payload) {
          assert.deepEqual(payload, { note: clearanceNote });
          assert.equal(url.searchParams.get('note'), 'eq.Awaiting review');
        } else assert.equal(payload.status, 'cleared');
        Object.assign(record.clearances[0], payload);
        const row = 'note' in payload ? { note: clearanceNote } : { id: record.clearances[0].id };
        data = object ? row : [row];
      }
      if (table === 'lock_class_grades') gradesLocked = true;
      if (table === 'finalize_enrollment') enrollmentLocked = true;
      if (table === 'enrollment_requests') {
        studentRequests.push(...payload.map((item, index) => ({ ...item, id: 'student-request-' + index })));
      }
      if (table === 'review_enrollment_request') {
        const item = studentRequests.find(row => row.id === payload.p_request_id);
        assert.equal(role, 'staff');
        assert.equal(item.status, 'pending');
        item.status = payload.p_decision;
        data = item;
      }
      if (table === 'save_course_offering_with_instructor') data = { ...offerings[0], id: 3, instructor_id: null, instructor_name: null };
      if (table === 'publish_summer_offering') {
        publishedSummer = data = { ...offerings.find(o => o.id === payload.p_source_offering_id), id: 4,
          semester: 'Summer', school_year: payload.p_school_year, instructor_id: null, enrollment_open: false };
      }
      if (table === 'enrollments' && role === 'registrar') {
        data = { ...payload, id: 'new-offer', course_offerings: offerings.find(o => o.id === payload.offering_id) };
        registrarOffers.push(data);
      }
      return route.fulfill({ json: data });
    }
    if (table === 'profiles') { const p = { id: role, full_name: `${role} Tester`, email: `${role}@example.invalid`, role, status: 'approved', is_active: active, program: 'BSIT', year_level: '1st Year' }; data = object ? p : url.searchParams.get('role') === 'eq.student' ? students : [p]; }
    if (table === 'profiles' && url.searchParams.get('is_active') === 'eq.true') {
      data = students.filter(student => url.searchParams.get('id') === 'eq.' + student.id && student.is_active);
    }
    if (table === 'course_offerings') data = object ? { ...offerings[0], grades_locked: gradesLocked } : offerings.map(o => ({ ...o, grades_locked: gradesLocked }));
    if (table === 'course_offerings' && role === 'registrar') {
      if (failProspectusRefresh) return route.fulfill({ status: 400, json: { message: 'Prospectus unavailable' } });
      if (publishedSummer) data.push(publishedSummer);
    }
    if (table === 'list_student_records') data = students;
    if (table === 'get_subject_instructor_options') data = [{ id: 'teacher', role: 'teacher', full_name: 'Teacher Tester' }];
    if (table === 'courses') data = [{ code: 'SUM101', title: 'Summer Subject', year_level: 1, semester: 3, lec_units: 3, lab_units: 0, prerequisites: 'FIRST101' }];
    if (table === 'courses' && role === 'student') data.push(
      { code: 'IT201', title: 'Networks and Systems Administration', year_level: 2, semester: 1, lec_units: 2, lab_units: 1, prerequisites: 'SUM101' },
    );
    if (table === 'get_student_record') data = record;
    if (table === 'get_registrar_clearance_workspace') data = [{ ...registrarClearance, clearances: [...record.clearances, registrarClearance] }];
    if (table === 'clearances' && role === 'student') data = [...record.clearances, registrarClearance];
    if (table === 'get_class_roster') data = students.map(p => ({ student_id: p.id, profiles: p }));
    if (table === 'grades') data = role === 'student' ? offerings.map(o => ({ course_offerings: o, final: 1.5, equivalent: 2.75, grade_scale: 'school', remark: 'Passed' })) : students.map(p => ({ id: p.id, student_id: p.id, offering_id: 1, final: 1.5, equivalent: 2.75, grade_scale: 'school', remark: 'Passed' }));
    if (table === 'student_semesters') data = object ? { school_year: '2026-2027', semester: 'Summer' } : [];
    if (table === 'enrollments') {
      if (role === 'registrar' && failOfferRefresh) return route.fulfill({ status: 400, json: { message: 'Offers unavailable' } });
      data = role === 'student' ? [
        { offering_id: 1, course_offerings: offerings[0] },
        ...studentRequests.filter(item => item.status === 'approved').map(item => ({
          offering_id: item.offering_id, course_offerings: offerings.find(o => String(o.id) === item.offering_id),
        })),
      ] : role === 'registrar' ? registrarOffers : [];
    }
    if (table === 'enrollment_requests' && role === 'student') data = studentRequests;
    if (table === 'list_enrollment_request_history') data = role === 'staff'
      ? studentRequests.filter(item => ['all', item.status].includes(request.postDataJSON().p_status))
        .map(item => ({ ...offerings.find(o => String(o.id) === item.offering_id), ...item, student_name: 'student Tester', year_level: '1st Year' }))
      : offerings.map(o=>({...o,id:'request-'+o.id,student_id:students[0].id,student_name:students[0].full_name,student_no:students[0].student_no,year_level:'1st Year',status:'pending'}));
    if (table === 'enrollment_locks') data = enrollmentLocked ? [{ locked_at: '2026-10-21T00:00:00Z' }] : [];
    if (table === 'get_enrollment_workspace') data = { groups: [{ student_id: 'student-0', student_name: 'Student 0', student_no: 'TEST-0', year_level: '1st Year', school_year: '2026-2027', semester: 'Summer', units: 3, locked_at: enrollmentLocked ? '2026-10-21T00:00:00Z' : null }], terms: [{ school_year: '2026-2027', semester: 'Summer', is_open: true }] };
    if (table === 'instructor_notifications') data = [{ id: 'notification', subject: 'New enrollment — SUM101', body: 'Student 0 enrolled in Summer Subject.', created_at: '2026-10-21T00:00:00Z', read_at: null }];
    if (Array.isArray(data) && url.searchParams.has('offset')) data = data.slice(Number(url.searchParams.get('offset')), Number(url.searchParams.get('offset')) + Number(url.searchParams.get('limit')));
    return route.fulfill({ json: data });
  }
  return url.origin === origin ? route.continue() : route.abort();
});
try {
  await page.goto(origin + '/faculty/dean-dashboard.html');
  await page.getByText('dean Tester', { exact: true }).first().waitFor();
  assert.equal(await page.locator('.sidebar .nav-item').first().textContent(), 'Enrollment Requests');
  assert.equal(await page.locator('[data-page="financial"],#page-financial,#conflictsList').count(), 0);
  await page.locator('[data-page="faculty"]').click();
  await page.locator('#workloadBody').getByText('Teacher Tester', { exact: true }).waitFor();
  assert.equal(await page.getByRole('combobox', { name: 'Instructor for SUM101' }).inputValue(), 'teacher');
  await page.locator('.edit-offering-btn[data-id="1"]').click();
  assert.equal(await page.locator('#field_code').inputValue(), 'SUM101');
  assert.equal(await page.locator('#field_instructor_id').inputValue(), 'teacher');
  const desktopViewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  const offeringBox = await page.locator('#modalOverlay .modal-box').boundingBox();
  assert(offeringBox.x >= 0 && offeringBox.x + offeringBox.width <= 390, 'The edit form fits on a phone');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: 'Edit Subject / Course Offering' }).waitFor({ state: 'hidden' });
  await page.setViewportSize(desktopViewport);
  await page.locator('[data-page="classes"]').click();
  await page.locator('#deanScopeAllBtn').click();
  await page.locator('#myCourseList [data-id="1"]').waitFor();
  await page.selectOption('.grading-year-select', '2');
  assert.equal(await page.locator('#myCourseList [data-id="1"]').count(), 0, 'Class year filter excludes other years');
  await page.selectOption('.grading-year-select', '1');
  assert.equal(await page.locator('#myCourseList [data-id="1"]').count(), 1, 'Class year filter includes matching years');
  await page.locator('#deanAddClassBtn').click();
  await page.locator('#field_catalog_search').fill('summer');
  await page.locator('#subjectResults button').filter({ hasText: 'SUM101' }).click();
  assert((await page.locator('#subjectInsights').textContent()).includes('Prerequisites: FIRST101'));
  assert.equal(await page.locator('#field_semester').inputValue(), 'Summer');
  await page.locator('.subject-details summary').click();
  await page.selectOption('#field_program', 'BSIT');
  await page.selectOption('#field_instructor_id', '');
  await page.locator('#modalSaveBtn').click();
  await page.waitForFunction(() => !document.querySelector('#modalOverlay').classList.contains('open'));
  assert.equal(writes.find(w => w.table === 'save_course_offering_with_instructor').payload.p_instructor_id, null);
  await page.locator('[data-page="records"]').click();
  await page.locator('#recordSearch').fill('TEST-0');
  await page.locator('#recordStudents [data-student="student-0"]').click();
  await page.getByRole('heading', { name: 'Payment Records' }).waitFor();
  assert((await page.locator('#recordDetails').textContent()).includes('2.75'));
  await page.getByRole('region', { name: 'Grades', exact: true }).getByText('94%', { exact: true }).waitFor();
  await page.getByText('No billing summary on file', { exact: true }).waitFor();
  await page.locator('[data-page="compliance"]').click();
  await page.locator('#clearanceStudents [data-student="student-0"]').click();
  await page.locator('#clearanceDetails [data-clearance-note-text]').filter({ hasText: 'Awaiting review' }).waitFor();
  await page.getByRole('region', { name: 'Clearance requirements' }).getByText('Action Required', { exact: true }).waitFor();
  await page.getByText('Edit note', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Dean clearance note' }).fill(clearanceNote);
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await page.locator('#clearanceDetails [data-clearance-note-text]').filter({ hasText: 'Submit the signed advising form.' }).waitFor();
  assert.equal(record.clearances[0].status, 'action_required');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: /Clear College Dean requirement/ }).click();
  await page.locator('#clearanceDetails').getByText('✓ Cleared requirement', { exact: true }).waitFor();
  assert(await page.locator('#clearanceStudents').evaluate(e => e.scrollHeight > e.clientHeight));
  assert(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1));
  await page.screenshot({ path: '.temp/adviser-layout/dean-clearance.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelector('#sidebar').getBoundingClientRect().right <= 1);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: '.temp/adviser-layout/dean-clearance-mobile.png' });

  role = 'teacher'; await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + '/faculty/teacher-dashboard.html');
  await page.getByText('teacher Tester', { exact: true }).first().waitFor();
  await page.getByText('New enrollment — SUM101', { exact: true }).waitFor();
  await page.locator('[data-page="classes"]').click();
  await page.locator('#courseList [data-id="1"]').click();
  await page.locator('.lock-grades-btn:enabled').waitFor();
  assert(await page.locator('.grading-table-wrap').evaluate(e => e.scrollHeight > e.clientHeight));
  assert(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1));
  page.once('dialog', dialog => dialog.accept());
  await page.locator('.lock-grades-btn').click();
  await page.getByText('Grades finalized · locked', { exact: true }).waitFor();
  assert(await page.locator('.equivalent-input').first().evaluate(e => e.readOnly));
  assert(await page.locator('#saveGradesBtn').isDisabled());

  role = 'dean'; await page.goto(origin + '/staff/enrollment-requests.html');
  await page.locator('#requests .student-request').waitFor();
  assert.equal(await page.locator('#requests .student-request').count(),1);
  assert(!(await page.locator('#requests').textContent()).includes('FIRST101'));
  await page.selectOption('#reviewTerm','2026-2027|1st Semester');
  await page.locator('#requests').getByText('FIRST101 — First Semester Subject').waitFor();
  assert.equal(await page.locator('[data-finalize]').count(),0,'Finalization groups use the same semester filter');
  await page.selectOption('#reviewTerm','2026-2027|Summer');
  await page.selectOption('#reviewYear','2');
  await page.locator('[data-finalize]').waitFor({state:'hidden'});
  assert.equal(await page.locator('[data-finalize]').count(),0,'Finalization groups respect student year level');
  await page.selectOption('#reviewYear','1');
  await page.locator('[data-finalize]').waitFor({state:'attached'});
  await page.locator('summary').filter({ hasText: "Finalize a student's enrollment" }).click();
  await page.locator('[data-finalize]').waitFor();
  await page.locator('[data-finalize]').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByText('Finalized and locked', { exact: true }).waitFor();
  await page.locator('#termManager summary').click();
  await page.locator('#openTerm').click();
  await page.waitForFunction(() => !document.querySelector('#refresh').disabled);
  assert(writes.some(w => w.table === 'set_enrollment_term' && w.payload.p_semester === 'Summer'));

  role = 'registrar'; await page.goto(origin + '/staff/registrar-dashboard.html');
  await page.locator('#registrarTerm option[value="2026-2027|Summer"]').waitFor({state:'attached'});
  await page.locator('#registrarClearanceNav').click();
  await page.locator('[data-registrar-student="student-0"]').click();
  await page.getByText('Edit note', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Registrar clearance note' }).fill('Submit your birth certificate.');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await page.locator('#registrarClearanceDetails [data-clearance-note-text]').filter({ hasText: 'Submit your birth certificate.' }).waitFor();
  assert.equal(registrarClearance.status, 'pending');
  await page.locator('[data-view="offers"]').click();
  await page.locator('[data-student-id="student-0"]').click();
  await page.selectOption('#registrarYear','2');
  assert.equal(await page.locator('[data-student-id="student-0"]').count(),0,'Registrar students respect year level');
  assert(!(await page.locator('#offersBody').textContent()).includes('SUM101'));
  await page.selectOption('#registrarYear','1');
  assert((await page.locator('#offersBody').textContent()).includes('SUM101'));
  assert(!(await page.locator('#offersBody').textContent()).includes('FIRST101'));
  await page.selectOption('#registrarTerm','2026-2027|1st Semester');
  await page.selectOption('#registrarYear','');
  assert((await page.locator('#offersBody').textContent()).includes('FIRST101'));
  assert(!(await page.locator('#offersBody').textContent()).includes('SUM101'));
  await page.locator('[data-student-id="student-2"]').press('Enter');
  assert(await page.locator('#btnAddOffer').isDisabled(), 'Inactive students can be reviewed but cannot receive offers');
  await page.locator('[data-student-id="student-1"]').press('Enter');
  await page.locator('#btnAddOffer').click();
  assert(await page.getByRole('dialog', { name: 'Offer a Subject' }).isVisible());
  assert.equal(await page.locator('#offerSubject').inputValue(), '2');
  await page.keyboard.press('Escape');
  await page.locator('#offerModal').waitFor({ state: 'hidden' });
  await page.locator('#btnAddOffer').click();
  failOfferRefresh = true;
  await page.locator('#btnConfirmOffer').click();
  await page.waitForFunction(() => document.querySelector('#offerRefreshError').textContent.includes('Change saved'));
  await page.locator('#offersBody').getByText('FIRST101', { exact: true }).waitFor();
  assert.equal(writes.filter(w => w.table === 'enrollments').length, 1);
  failOfferRefresh = false;
  await page.locator('#refreshOffers').click();
  await page.waitForFunction(() => !document.querySelector('#offerRefreshError').textContent);
  assert((await page.locator('#offersBody').textContent()).includes('FIRST101'));
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>document.querySelector('#sidebar').getBoundingClientRect().right<=1);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'.temp/adviser-layout/registrar-semester.png'});
  await page.setViewportSize({width:1440,height:900});
  await page.locator('[data-view="prospectus"]').click();
  await page.locator('#summerPublisher summary').click();
  await page.selectOption('#summerSubject','2');
  await page.fill('#summerSchoolYear','2027-2026');
  await page.locator('#publishSummer').click();
  await page.waitForFunction(() => document.querySelector('#summerPublishStatus').textContent.includes('consecutive years'));
  assert(!writes.some(w => w.table === 'publish_summer_offering'), 'Reversed years are rejected before submitting');
  await page.fill('#summerSchoolYear','2026-2027');
  await page.fill('#summerSchedule','MWF 09:00-10:00');
  failProspectusRefresh = true;
  await page.locator('#publishSummer').click();
  await page.waitForFunction(()=>document.querySelector('#summerPublishStatus').textContent.includes('published'));
  await page.waitForFunction(() => document.querySelector('#prospectusRefreshError').textContent.includes('Could not refresh'));
  assert.equal(await page.locator('#registrarTerm').inputValue(), '2026-2027|Summer');
  await page.locator('#prospectusBody').getByText('FIRST101', { exact: true }).waitFor();
  failProspectusRefresh = false;
  await page.locator('#refreshProspectus').click();
  await page.waitForFunction(() => !document.querySelector('#prospectusRefreshError').textContent);
  assert.equal(writes.filter(w => w.table === 'publish_summer_offering').length, 1);
  assert(writes.some(w=>w.table==='publish_summer_offering' && w.payload.p_source_offering_id===2 && w.payload.p_school_year==='2026-2027'));

  role = 'student'; await page.goto(origin + '/student/dashboard.html');
  await page.locator('#enrollmentTerm option[value="2026-2027|Summer"]').waitFor({ state: 'attached' });
  await page.locator('[data-page="clearance"]').click();
  await page.locator('#deptGrid').getByText('Submit the signed advising form.', { exact: false }).waitFor();
  assert((await page.locator('#deptGrid').textContent()).includes(clearanceNote));
  await page.locator('#deptGrid').getByText('Submit your birth certificate.', { exact: true }).waitFor();
  await page.locator('[data-page="enrollment"]').click();
  assert.equal(await page.locator('.sidebar .nav-item').first().getAttribute('data-page'), 'enrollment');
  await page.waitForFunction(() => state.enrollmentLocked);
  assert((await page.locator('#enrollmentLockStatus').textContent()).includes('already enrolled'));
  assert(await page.locator('#proceedBtn').isDisabled(), 'A finalized enrollment cannot be submitted again');
  assert.equal(await page.locator('[data-page="schedule"],#page-schedule').count(), 0);
  await page.locator('[data-page="grades"]').click();
  await page.selectOption('#gradeYearFilter', '2');
  assert((await page.locator('#gradesBody').textContent()).includes('No grades recorded'));
  await page.selectOption('#gradeYearFilter', '1');
  assert((await page.locator('#gradesBody').textContent()).includes('SUM101'));
  await page.screenshot({ path: '.temp/adviser-layout/student-grades.png' });
  const prospectus = page.getByRole('dialog', { name: 'Degree Prospectus' });
  const prospectusTrigger = page.getByRole('button', { name: 'View Degree Prospectus' });
  await page.setViewportSize({ width: 390, height: 844 });
  await prospectusTrigger.press('Enter');
  await prospectus.getByRole('heading', { name: '1st Year — Summer' }).waitFor();
  await prospectus.getByRole('heading', { name: '2nd Year — 1st Semester' }).waitFor();
  assert.equal(await prospectus.getByRole('progressbar').getAttribute('aria-valuenow'), '50');
  assert.match(await prospectus.textContent(), /Final Grade: 2\.75/);
  assert.match(await prospectus.textContent(), /Prereq: SUM101/);
  assert.match(await prospectus.textContent(), /2 Lec · 1 Lab/);
  assert.match(await prospectus.textContent(), /Pending/);
  const prospectusBox = await prospectus.boundingBox();
  assert(prospectusBox.x >= 0 && prospectusBox.x + prospectusBox.width <= 390);
  assert(await prospectus.evaluate(element => element.scrollWidth <= element.clientWidth));
  await page.keyboard.press('Escape');
  await prospectus.waitFor({ state: 'hidden' });
  await page.locator('#prospectusBtn:focus').waitFor();
  await prospectusTrigger.click();
  await prospectus.getByRole('button', { name: 'Close degree prospectus' }).click();
  await prospectus.waitFor({ state: 'hidden' });
  await prospectusTrigger.click();
  await prospectus.waitFor();
  await page.mouse.click(1, 1);
  await prospectus.waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 1440, height: 900 });
  enrollmentLocked=false; offerings[0].enrollment_open=false;
  await page.locator('[data-page="enrollment"]').click();
  await page.locator('#refreshEnrollment').click();
  await page.waitForFunction(()=>document.querySelector('#enrollmentLockStatus').textContent.includes('already enrolled'));
  assert((await page.locator('#courseList').textContent()).includes('SUM101'),'Closing enrollment keeps enrolled subjects visible');
  failEnrollmentFees=true;
  await page.locator('#refreshEnrollment').click();
  await page.waitForFunction(()=>document.querySelector('#enrollmentLockStatus').textContent.includes('already enrolled'));
  assert.equal(await page.locator('#page-enrollment').getByText('Billing Summary', {exact:true}).count(),0);
  assert((await page.locator('#courseList').textContent()).includes('SUM101'),'Unavailable fees do not block enrollment subjects');
  assert(await page.locator('#proceedBtn').isDisabled());
  failEnrollmentFees=false;
  await page.locator('#refreshEnrollment').click();
  await page.waitForFunction(()=>document.querySelector('#enrollmentLockStatus').textContent.includes('already enrolled'));

  offerings[1].year=1;
  failEnrollmentFees=true;
  await page.locator('#refreshEnrollment').click();
  await page.locator('#enrollmentTerm option[value="2026-2027|1st Semester"]').waitFor({state:'attached'});
  await page.selectOption('#enrollmentTerm','2026-2027|1st Semester');
  const subject = page.getByRole('checkbox', { name: 'FIRST101 — First Semester Subject' });
  await subject.press('Space');
  assert(await subject.isChecked());
  await subject.press('Space');
  assert(!(await subject.isChecked()));
  await subject.press('Space');
  assert.equal(await page.locator('#page-enrollment .amt').count(),0,'Enrollment does not show fee amounts');
  await page.locator('#proceedBtn').press('Enter');
  await page.getByRole('heading',{name:'Enrollment Request Submitted!'}).waitFor();
  assert(writes.some(w=>w.table==='enrollment_requests' && w.payload.some(r=>r.offering_id==='2' && r.status==='pending')),'Enroll Now submits directly without fee review');
  failEnrollmentFees=false;

  role = 'staff';
  await page.goto(origin + '/staff/enrollment-requests.html');
  await page.selectOption('#reviewTerm', '2026-2027|1st Semester');
  const approve = page.locator('[data-id="student-request-0"][data-decision="approved"]');
  await approve.click();
  await approve.waitFor({ state: 'detached' });
  assert.equal(studentRequests[0].status, 'approved');
  role = 'student';
  await page.goto(origin + '/student/dashboard.html');
  await page.locator('[data-page="enrollment"]').click();
  await page.selectOption('#enrollmentTerm','2026-2027|1st Semester');
  await page.locator('#courseList').getByText('Enrolled', { exact: true }).waitFor();
  assert(await page.locator('#proceedBtn').isDisabled(), 'Approved enrollment cannot be submitted again');

  role = 'dean'; failDashboard = true;
  await page.goto(origin + '/faculty/dean-dashboard.html');
  await page.getByText('Dashboard unavailable', { exact: true }).waitFor();
  await page.locator('#page-dashboard').getByRole('alert').waitFor();
  assert((await page.locator('#page-dashboard').textContent()).includes('Reports are unavailable'));
  failDashboard = false;
  role = 'teacher'; active = false;
  await page.goto(origin + '/faculty/teacher-dashboard.html');
  await page.getByRole('heading', { name: 'Account deactivated' }).waitFor();
  role = 'student';
  await page.goto(origin + '/student/dashboard.html');
  await page.getByRole('heading', { name: 'Account deactivated' }).waitFor();
  assert.deepEqual(errors, []);
  console.log('Adviser UI: search/insights, unassigned subjects, Dean records/clearance, scrolling, grade lock, enrollment lock, Summer, year filter, notifications, and inactive-account denial passed.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
