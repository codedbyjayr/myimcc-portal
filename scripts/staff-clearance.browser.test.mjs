import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, readFile } from 'node:fs/promises';
import { server } from './test-portal.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sdk = await readFile(new URL('../node_modules/@supabase/supabase-js/dist/umd/supabase.js', import.meta.url), 'utf8');
process.env.TEST_PORTAL_UNTIL = new Date(Date.now() + 3600000).toISOString();
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const payload = '<img src=x onerror="alert(1)">';
const initialRows = [
  { id: 1, student_id: 'student-1', department_code: 'library', department_name: 'Library', status: 'pending', note: 'Review books', profiles: { full_name: 'Alice Student', student_no: 'TEST-1', program: 'BSIT', year_level: '2nd Year' } },
  { id: 2, student_id: 'student-2', department_code: 'CASH', department_name: 'Cashier', status: 'cleared', note: null, profiles: { full_name: 'Bob Student', student_no: 'TEST-2', program: 'BSN' } },
  { id: 3, student_id: 'student-3', department_code: 'MED', department_name: 'Medical', status: 'action_required', note: payload, profiles: { full_name: payload, student_no: 'TEST-3', program: 'BSIT' } },
];
let rows = structuredClone(initialRows), readError = true, failAt = null, writeError = false, zeroRows = false, readOnly = false, active = true;
let holdWrite = false, releaseWrite;
const writes = [], errors = [], assets = [];
let reads = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => assets.push(new URL(request.url()).pathname));
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.hostname === 'cdn.jsdelivr.net') return route.fulfill({ contentType: 'text/javascript', body: sdk });
    if (url.origin === origin && url.pathname === '/auth/login.html') return route.fulfill({ contentType: 'text/html', body: '<h1>Sign in</h1>' });
    if (url.origin === origin && url.pathname === '/shared/supabase-config.js') return route.fulfill({ contentType: 'text/javascript', body: `
      window.IMCC_DEVELOPER_VIEW = ${readOnly};
      const client = supabase.createClient('https://clearance-test.invalid', 'public-test', { auth: { persistSession: false, autoRefreshToken: false } });
      client.auth.getUser = async () => ({ data: { user: { id: 'staff', email: 'staff@example.invalid' } } });
      client.auth.signOut = async () => ({ error: window.testSignOutError ? new Error('Sign out failed') : null });
      client.channel = () => ({ on() { return this; }, subscribe() { return this; } });
      window.supabaseClient = window.__myimcc_supabase_client__ = client;
      window.getSupabaseClientAsync = async () => client;
    ` });
    if (url.hostname === 'clearance-test.invalid') {
      const table = url.pathname.split('/').pop();
      if (table === 'profiles') return route.fulfill({ json: { id: 'staff', role: 'staff', role_department: 'Library', status: 'approved', is_active: active } });
      if (table === 'get_clearance_workspace') {
        reads++;
        assert.equal(url.searchParams.get('order'), 'id.asc');
        const from = Number(url.searchParams.get('offset') || 0);
        if (readError || (failAt !== null && from >= failAt)) return route.fulfill({ status: 503, json: { message: 'Read denied' } });
        return route.fulfill({ json: rows.slice(from, from + Math.min(137, Number(url.searchParams.get('limit') || 500))) });
      }
      if (table === 'clearances' && request.method() === 'PATCH') {
        const body = request.postDataJSON();
        if ('note' in body) {
          assert.deepEqual(body, { note: 'Return the overdue book.' });
          assert.equal(url.searchParams.get('department_code'), 'eq.library');
          assert.equal(url.searchParams.get('status'), 'eq.pending');
          assert.equal(url.searchParams.get('note'), 'eq.Review books');
          rows[0].note = body.note;
          return route.fulfill({ json: request.headers().accept?.includes('object+json') ? { note: body.note } : [{ note: body.note }] });
        }
        writes.push({ body, student: url.searchParams.get('student_id'), department: url.searchParams.get('department_code') });
        assert.equal(body.status, 'cleared');
        assert(Number.isFinite(Date.parse(body.cleared_at)));
        assert.equal(url.searchParams.get('select'), 'id');
        if (holdWrite) await new Promise(resolve => { releaseWrite = resolve; });
        if (writeError) return route.fulfill({ status: 403, json: { message: 'Write denied' } });
        if (zeroRows) return route.fulfill({ json: null });
        const record = rows.find(row => 'eq.' + row.student_id === url.searchParams.get('student_id') && 'eq.' + row.department_code === url.searchParams.get('department_code'));
        assert(record, 'Writes must target the selected student and office');
        record.status = 'cleared';
        return route.fulfill({ json: { id: record.id } });
      }
      throw new Error('Unexpected clearance request ' + request.method() + ' ' + url.pathname);
    }
    return url.origin === origin ? route.continue() : route.fulfill({ body: '' });
  });

  await page.goto(origin + '/staff/staff-dashboard.html');
  await page.getByRole('alert').waitFor();
  assert.equal(await page.locator('#totalClr').textContent(), '—');
  readError = false;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('totalClr').textContent === '3');
  assert.equal(await page.locator('#clearedCount').textContent(), '1');
  assert.equal(await page.locator('#pendingCount').textContent(), '2');
  assert.equal(await page.locator('#clearanceTable img').count(), 0, 'Database text is escaped by React');
  assert((await page.locator('#clearanceTable').textContent()).includes(payload));
  await page.getByRole('searchbox').fill('alice');
  assert.equal(await page.locator('#clearanceTable tr').count(), 1);
  await page.getByRole('searchbox').fill('TEST-1');
  assert.match(await page.locator('#clearanceTable').textContent(), /Alice Student/);
  await page.getByRole('searchbox').fill('');
  await page.selectOption('#filterYear', '2');
  assert.equal(await page.locator('#clearanceTable tr').count(), 1);
  assert.match(await page.locator('#clearanceTable').textContent(), /Alice Student/);
  await page.selectOption('#filterYear', '');
  assert(await page.locator('button[data-student-id="student-3"]').isDisabled());
  await page.selectOption('#filterDept', 'Cashier');
  assert.equal(await page.locator('#clearanceTable tr').count(), 1);
  await page.selectOption('#filterDept', '');
  await page.selectOption('#filterStatus', 'action_required');
  assert((await page.locator('#clearanceTable').textContent()).includes(payload));
  await page.selectOption('#filterStatus', '');

  const alice = page.locator('button[data-student-id="student-1"]');
  await alice.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  assert.equal(writes.length, 0);
  assert.equal(await page.getByText('Edit note', { exact: true }).count(), 1, 'Only the assigned office is editable');
  await page.getByText('Edit note', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Library clearance note' }).fill('Return the overdue book.');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await page.getByText('Clearance note saved.', { exact: true }).waitFor();
  assert.equal(rows[0].status, 'pending');
  await page.getByText('Edit note', { exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: 'Library clearance note' }).inputValue(), 'Return the overdue book.');
  await page.getByText('Edit note', { exact: true }).click();
  writeError = true;
  const beforeRead = reads;
  await alice.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mark Cleared' }).click();
  await page.getByRole('alert').filter({ hasText: 'Write denied' }).waitFor();
  assert(await alice.isEnabled());
  assert.equal(reads, beforeRead, 'Failed writes keep the current records');
  writeError = false;
  zeroRows = true;
  await alice.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mark Cleared' }).click();
  await page.getByRole('alert').filter({ hasText: 'No clearance was changed' }).waitFor();
  assert.equal(await page.locator('#clearedCount').textContent(), '1');
  zeroRows = false;
  holdWrite = true;
  await alice.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mark Cleared' }).click();
  await page.getByRole('button', { name: 'Saving…', exact: true }).waitFor();
  const writesBeforeDuplicate = writes.length;
  assert(await page.locator('#signOutBtn').isDisabled());
  assert(await page.getByRole('button', { name: 'Refresh', exact: true }).isDisabled());
  await alice.evaluate(button => button.click());
  assert.equal(writes.length, writesBeforeDuplicate);
  releaseWrite();
  holdWrite = false;
  await page.waitForFunction(() => document.getElementById('clearedCount').textContent === '2');
  await page.getByRole('status').filter({ hasText: 'Clearance approved successfully' }).waitFor();
  assert.deepEqual(writes.at(-1).student, 'eq.student-1');
  assert.deepEqual(writes.at(-1).department, 'eq.library');

  await mkdir('.temp/staff-clearance', { recursive: true });
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 950 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'The page fits the viewport');
      assert.equal(await page.locator('table').evaluate(table => getComputedStyle(table).minWidth), '580px', 'Tailwind table sizing is loaded');
      if (width === 320) await page.screenshot({ path: `.temp/staff-clearance/${theme}-mobile.png` });
    }
    await page.screenshot({ path: `.temp/staff-clearance/${theme}.png` });
  }

  rows = Array.from({ length: 1206 }, (_, id) => ({ ...initialRows[0], id, student_id: 'bulk-' + id }));
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('totalClr').textContent === '1206');
  failAt = 500;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Displayed results may be outdated' }).waitFor();
  assert.equal(await page.locator('#totalClr').textContent(), '1206');
  assert.equal(await page.locator('#clearanceTable tr').count(), 1206);
  assert(await page.locator('#clearanceTable button').first().isDisabled());
  failAt = null;
  await page.selectOption('#filterDept', 'Library');
  rows = [];
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByText('No clearance records found.', { exact: true }).waitFor();
  assert.equal(await page.locator('#totalClr').textContent(), '0');
  assert.equal(await page.locator('#filterDept').inputValue(), '', 'A removed department cannot leave an invisible active filter');

  await page.evaluate(() => { window.testSignOutError = true; });
  await page.locator('#signOutBtn').click();
  await page.getByRole('alert').filter({ hasText: 'Sign out failed' }).waitFor();
  assert(await page.locator('#signOutBtn').isEnabled());
  await page.evaluate(() => { window.testSignOutError = false; });
  await page.locator('#signOutBtn').click();
  await page.waitForURL(origin + '/auth/login.html');

  rows = structuredClone(initialRows);
  readOnly = true;
  await page.goto(origin + '/staff/staff-dashboard.html');
  await page.waitForFunction(() => document.getElementById('totalClr').textContent === '3');
  assert(await page.locator('#clearanceTable button').first().isDisabled());
  active = false;
  const readsBeforeDenial = reads;
  await page.goto(origin + '/staff/staff-dashboard.html');
  await page.getByRole('heading', { name: 'Account deactivated' }).waitFor();
  assert.equal(reads, readsBeforeDenial, 'Denied users never query the clearance workspace');
  assert(!assets.includes('/staff/staff-dashboard.js'), 'The retired controller is never loaded');
  assert(!assets.includes('/staff/staff-dashboard.css'), 'The retired stylesheet is never loaded');
  assert.deepEqual(errors, []);
  console.log('React staff clearance: filters, escaped data, confirmation, verified saves, duplicate prevention, pagination, failure recovery, sign-out, read-only/denied access, and responsive themes passed.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
