import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { server } from './test-portal.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sdk = await readFile(new URL('../node_modules/@supabase/supabase-js/dist/umd/supabase.js', import.meta.url), 'utf8');
process.env.TEST_PORTAL_UNTIL = new Date(Date.now() + 3600000).toISOString();
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const payload = '<img src=x onerror="alert(1)">';
const base = { student_id: 'student-a', student_name: 'Demo Student', student_no: 'DEMO-001', program: 'BSIT', year_level: '1st Year', section: 'A', school_year: '2026-2027', semester: '1st Semester', enrolled_units: 3, enrolled_courses: [{ code: 'EXISTING', title: 'Existing subject', units: 3 }] };
const initial = [
  { ...base, id: 'request-1', code: 'DEMO101', title: 'Introduction to Computing', units: 3, status: 'pending', schedule: 'Mon 09:00–10:30' },
  { ...base, id: 'request-2', code: 'DEMO102', title: 'Second subject', units: 1.5, status: 'pending' },
  { ...base, id: 'request-3', code: 'REJECTED', title: payload, units: 3, status: 'rejected', review_note: payload },
  { ...base, id: 'request-4', student_id: 'student-b', student_name: 'Other Student', semester: '2nd Semester', year_level: '2nd Year', code: 'OTHER', title: 'Other semester', units: 2, status: 'pending' },
  { ...base, id: 'request-5', code: 'APPROVED', title: 'Approved subject', units: 3, status: 'approved' },
];
let records = structuredClone(initial), role = 'dean', active = true, readOnly = false, locked = false;
let failHistory = false, failWorkspace = false, failWrite = '', holdHistory = false, holdWrite = false;
let releaseHistory, releaseWrite, notifyHistoryHeld, notifyWriteHeld;
const historyHeld = new Promise(resolve => { notifyHistoryHeld = resolve; });
const writeHeld = new Promise(resolve => { notifyWriteHeld = resolve; });
const terms = ['1st Semester', '2nd Semester', 'Summer'].map(semester => ({ school_year: '2026-2027', semester, is_open: false }));
const errors = [], writes = [], assets = [], reads = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => assets.push(new URL(request.url()).pathname));
  await page.addInitScript(() => localStorage.setItem('myimcc_theme', 'dark'));
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.hostname === 'cdn.jsdelivr.net') return route.fulfill({ contentType: 'text/javascript', body: sdk });
    if (url.origin === origin && url.pathname === '/shared/supabase-config.js') return route.fulfill({ contentType: 'text/javascript', body: `
      window.IMCC_DEVELOPER_VIEW = ${readOnly ? 'true' : 'undefined'};
      const client = supabase.createClient('https://enrollment-ui.invalid', 'public-test', { auth: { persistSession: false, autoRefreshToken: false } });
      client.auth.getUser = async () => ({ data: { user: { id: 'actor', email: 'actor@example.invalid' } } });
      client.channel = name => ({ name, on(type, spec, callback) { if (name.startsWith('academic-refresh')) window.testAcademicChange = callback; return this; }, subscribe() { return this; } });
      client.removeChannel = channel => { if (channel.name.startsWith('academic-refresh')) window.testAcademicStops = (window.testAcademicStops || 0) + 1; };
      window.supabaseClient = window.__myimcc_supabase_client__ = client;
      window.getSupabaseClientAsync = async () => client;
    ` });
    if (url.hostname === 'enrollment-ui.invalid') {
      const rpc = url.pathname.split('/').pop();
      if (rpc === 'profiles') return route.fulfill({ json: { id: 'actor', role, status: 'approved', is_active: active } });
      const body = request.postDataJSON() || {};
      if (rpc === 'list_enrollment_request_history') {
        reads.push(body.p_status);
        if (failHistory) return route.fulfill({ status: 403, json: { message: 'History denied' } });
        const data = structuredClone(records.filter(record => body.p_status === 'all' || record.status === body.p_status));
        if (holdHistory && body.p_status === 'approved') await new Promise(resolve => { releaseHistory = resolve; notifyHistoryHeld(); });
        return route.fulfill({ json: data });
      }
      if (rpc === 'get_enrollment_workspace') {
        if (failWorkspace) return route.fulfill({ status: 503, json: { message: 'Workspace denied' } });
        return route.fulfill({ json: { terms, groups: [{ ...base, units: 3, locked_at: locked ? '2026-11-05T00:00:00Z' : null }] } });
      }
      writes.push({ rpc, body });
      if (holdWrite) await new Promise(resolve => { releaseWrite = resolve; notifyWriteHeld(); });
      if (failWrite === rpc) return route.fulfill({ status: 403, json: { message: 'Write denied' } });
      if (rpc === 'review_enrollment_request') {
        const record = records.find(record => record.id === body.p_request_id);
        assert(record);
        record.status = body.p_decision;
        record.review_note = body.p_review_note;
      } else if (rpc === 'finalize_enrollment') {
        assert.equal(body.p_student_id, 'student-a');
        assert.equal(body.p_semester, '1st Semester');
        locked = true;
      } else if (rpc === 'set_enrollment_term') {
        const term = terms.find(term => term.school_year === body.p_school_year && term.semester === body.p_semester);
        assert(term);
        term.is_open = body.p_open;
      } else throw new Error('Unexpected enrollment RPC ' + rpc);
      return route.fulfill({ json: null });
    }
    return url.origin === origin ? route.continue() : route.fulfill({ body: '' });
  });

  await page.goto(origin + '/staff/enrollment-requests.html');
  await page.getByRole('heading', { name: 'Nothing waiting for review' }).waitFor();
  assert.equal(await page.locator('#reviewTerm').inputValue(), '2026-2027|Summer', 'Default review selects the newest supported term');
  await page.selectOption('#reviewTerm', '2026-2027|1st Semester');
  await page.getByRole('heading', { name: 'Demo Student DEMO-001' }).waitFor();
  assert((await page.locator('.load-summary').last().textContent()).includes('4.5 pending units'));
  assert((await page.locator('.load-summary').last().textContent()).includes('7.5 units if all pending subjects are approved'));
  assert((await page.locator('#requests').textContent()).includes('EXISTING — Existing subject'));
  await page.selectOption('#reviewYear', '2');
  await page.getByRole('heading', { name: 'Nothing waiting for review' }).waitFor();
  await page.selectOption('#reviewYear', '');
  await page.selectOption('#reviewTerm', '');
  assert.equal(await page.locator('.student-request').count(), 2, 'Different students and semesters stay separate');
  await page.selectOption('#reviewTerm', '2026-2027|1st Semester');

  holdHistory = true;
  await page.selectOption('#statusFilter', 'approved');
  await historyHeld;
  await page.selectOption('#statusFilter', 'rejected');
  await page.locator('.status-rejected').waitFor();
  const oldWorkspace = page.waitForResponse(response => response.url().endsWith('/get_enrollment_workspace'));
  releaseHistory();
  await oldWorkspace;
  await page.waitForTimeout(100);
  holdHistory = false;
  assert.equal(await page.locator('#statusFilter').inputValue(), 'rejected');
  assert.equal(await page.locator('.status-approved').count(), 0, 'A delayed response cannot overwrite a newer filter');
  assert((await page.locator('#requests').textContent()).includes(payload));
  assert.equal(await page.locator('#requests img').count(), 0, 'Database values render as text');
  assert.equal(await page.locator('[data-decision]').count(), 0, 'History rows cannot be reviewed again');

  await page.selectOption('#statusFilter', 'pending');
  const approve = page.locator('[data-id="request-1"][data-decision="approved"]');
  await approve.waitFor();
  failWrite = 'review_enrollment_request';
  await approve.click();
  await page.getByRole('alert').filter({ hasText: 'Write denied' }).waitFor();
  assert(await approve.isEnabled());
  failWrite = '';
  holdWrite = true;
  await approve.click();
  await writeHeld;
  const beforeDuplicate = writes.length;
  assert(await page.locator('#statusFilter').isDisabled());
  assert(await page.locator('#refresh').isDisabled());
  await approve.evaluate(button => button.click());
  assert.equal(writes.length, beforeDuplicate, 'Busy actions cannot submit duplicate writes');
  releaseWrite();
  holdWrite = false;
  await approve.waitFor({ state: 'detached' });

  const reject = page.locator('[data-id="request-2"][data-decision="rejected"]');
  await reject.click();
  const beforeCancel = writes.length;
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  assert.equal(writes.length, beforeCancel);
  await reject.click();
  const beforeBackground = reads.length;
  await page.evaluate(() => window.testAcademicChange());
  await page.waitForTimeout(500);
  assert.equal(reads.length, beforeBackground, 'Live events do not redraw a confirmation');
  await page.locator('#reviewReason').fill('   ');
  await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('dialog').getByRole('alert').filter({ hasText: 'A rejection reason is required' }).waitFor();
  assert.equal(writes.length, beforeCancel, 'Whitespace reasons never reach the API');
  assert.equal(await page.locator('#reviewReason').getAttribute('maxlength'), '1000');
  await page.locator('#reviewReason').fill('  Missing prerequisite  ');
  await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('heading', { name: 'Nothing waiting for review' }).waitFor();
  assert.equal(writes.at(-1).body.p_review_note, 'Missing prerequisite');

  await page.locator('summary').filter({ hasText: "Finalize a student's enrollment" }).click();
  await page.getByRole('button', { name: 'Finalize Enrollment', exact: true }).click();
  failWrite = 'finalize_enrollment';
  await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('dialog').getByRole('alert').filter({ hasText: 'Write denied' }).waitFor();
  failWrite = '';
  await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).click();
  await page.getByText('Finalized and locked', { exact: true }).waitFor();
  await page.locator('#termManager summary').click();
  failWrite = 'set_enrollment_term';
  await page.locator('#openTerm').click();
  await page.locator('#termStatus').filter({ hasText: 'Write denied' }).waitFor();
  assert(await page.locator('#openTerm').isEnabled());
  failWrite = '';
  for (const semester of ['1st Semester', '2nd Semester', 'Summer']) {
    await page.selectOption('#enrollmentTermSelect', JSON.stringify(['2026-2027', semester]));
    await page.locator('#openTerm').click();
    await page.locator('#termStatus').filter({ hasText: `opened for ${semester}` }).waitFor();
    await page.locator('#closeTerm').click();
    await page.locator('#termStatus').filter({ hasText: `closed for ${semester}` }).waitFor();
  }

  await page.selectOption('#statusFilter', 'rejected');
  await page.locator('.status-rejected').first().waitFor();
  const liveRead = page.waitForRequest(request => request.url().endsWith('/list_enrollment_request_history'));
  await page.evaluate(() => window.testAcademicChange());
  assert.equal((await liveRead).postDataJSON().p_status, 'rejected', 'Live refresh reads the current filter');
  await page.waitForFunction(() => !document.getElementById('refresh').disabled);
  await mkdir('.temp/enrollment-ui', { recursive: true });
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const overflow = await page.evaluate(() => [...document.querySelectorAll('main,select,header,details,section')]
        .filter(element => element.getBoundingClientRect().right > innerWidth + 1)
        .map(element => ({ tag: element.tagName, id: element.id, width: element.getBoundingClientRect().width })));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), JSON.stringify(overflow));
      if (width !== 768) await page.screenshot({ path: `.temp/enrollment-ui/${theme}-${width}.png`, fullPage: true });
    }
  }

  records = [];
  await page.locator('#refresh').click();
  await page.getByRole('heading', { name: 'No matching requests' }).waitFor();
  await page.getByRole('button', { name: 'View decision history' }).click();
  assert.equal(await page.locator('#statusFilter').inputValue(), 'all');
  await page.waitForFunction(() => !document.getElementById('refresh').disabled);
  failHistory = true;
  await page.locator('#refresh').click();
  await page.getByRole('alert').filter({ hasText: 'History denied' }).waitFor();
  assert.equal(await page.locator('.request-empty').count(), 0, 'Failure cannot look like an empty queue');
  failHistory = false;
  records = structuredClone(initial);
  await page.locator('#refresh').click();
  await page.locator('.student-request').waitFor();
  failWorkspace = true;
  records = [{ ...initial[0], code: 'PARTIAL-RESULT' }];
  await page.locator('#refresh').click();
  await page.getByRole('alert').filter({ hasText: 'displayed results may be outdated' }).waitFor();
  assert((await page.locator('#requests').textContent()).includes('DEMO101'));
  assert(!(await page.locator('#requests').textContent()).includes('PARTIAL-RESULT'));
  assert(await page.locator('[data-decision]').first().isDisabled());
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  assert.equal(await page.evaluate(() => window.testAcademicStops), 1, 'Leaving the workspace cleans up its live subscription');

  failWorkspace = false;
  records = structuredClone(initial);
  role = 'staff';
  await page.goto(origin + '/staff/enrollment-requests.html');
  await page.waitForFunction(() => !document.getElementById('refresh').disabled);
  assert(await page.locator('#termManager').isHidden());
  assert(await page.locator('#openTerm').isDisabled());
  role = 'dean';
  readOnly = true;
  await page.goto(origin + '/staff/enrollment-requests.html');
  await page.waitForFunction(() => !document.getElementById('refresh').disabled);
  await page.selectOption('#reviewTerm', '2026-2027|1st Semester');
  assert(await page.locator('[data-decision]').first().isDisabled());
  assert.equal(await page.locator('#openTerm').count(), 0, 'Read-only preview does not show term controls');
  active = false;
  const beforeDenial = reads.length;
  await page.goto(origin + '/staff/enrollment-requests.html');
  await page.getByRole('heading', { name: 'Account deactivated' }).waitFor();
  assert.equal(reads.length, beforeDenial, 'Denied users cannot query the workspace');
  assert(!assets.includes('/staff/enrollment-requests.js'));
  assert(!assets.includes('/staff/enrollment-requests.css'));
  assert.deepEqual(errors, []);
  console.log('React enrollment: grouping, stale responses, decisions, rejection validation, duplicate prevention, finalization, all terms, live updates/cleanup, failed reloads, permissions, and responsive themes passed.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
