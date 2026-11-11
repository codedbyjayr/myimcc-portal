import assert from 'node:assert/strict';
import { once } from 'node:events';
import { server } from './test-portal.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
process.env.TEST_PORTAL_UNTIL = new Date(Date.now() + 3600000).toISOString();
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;

try {
  const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let mode = 'onboarding';
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (['/auth/login.html', '/onboarding/awaiting-approval.html', '/student/dashboard.html'].includes(url.pathname)) {
      return route.fulfill({ contentType: 'text/html', body: '<h1>Destination</h1>' });
    }
    if (url.pathname !== '/shared/supabase-config.js') return route.continue();
    return route.fulfill({ contentType: 'text/javascript', body: `
      const mode = ${JSON.stringify(mode)};
      const user = { id: 'test-student', email: 'maria.santos@imcc.edu.ph' };
      let profile = { status: mode, role: mode === 'approved' ? 'student' : 'pending', is_active: true };
      window.rejectUpdate = true;
      window.getSupabaseClientAsync = async () => ({
        auth: {
          getUser: async () => ({ data: { user: mode === 'signed-out' ? null : user } }),
          signOut: async () => sessionStorage.setItem('signedOut', 'yes'),
        },
        from: table => {
          if (table === 'courses') return { select: () => ({ order: () => ({ range: async start => ({
            data: start === 0 ? [{ program: 'BSIT', year_level: 2 }] : [], error: null,
          }) }) }) };
          if (table !== 'profiles') throw new Error('Unexpected table');
          return {
            select: () => ({ eq: () => ({ single: async () => ({ data: profile }) }) }),
            update: values => ({ eq: async (field, id) => {
              if (field !== 'id' || id !== user.id) throw new Error('Unexpected profile filter');
              if (window.rejectUpdate) return { error: { message: 'Save temporarily unavailable' } };
              sessionStorage.setItem('roleUpdate', JSON.stringify(values));
              profile = values.requested_role === 'student'
                ? { status: 'approved', role: 'student', is_active: true }
                : { status: 'pending', role: 'pending', is_active: true };
              return { error: null };
            } }),
          };
        },
      });
    ` });
  });

  const selectRole = origin + '/onboarding/select-role.html';
  await page.goto(selectRole);
  assert.equal(await page.locator('h1').textContent(), 'Complete Profile');
  await page.waitForFunction(() => !document.getElementById('submitBtn').disabled);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Form fits 320px');
  assert.equal(await page.locator('section').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(29, 23, 36)');
  await page.getByLabel('Full Name').fill('  Fictional User  ');
  await page.getByLabel('School ID / Employee Number').fill('2024-1049');
  await page.getByLabel('I am requesting access as a:').selectOption('faculty');
  assert(await page.locator('#studentAcademicFields').isHidden());
  await page.getByRole('button', { name: 'Submit for Approval' }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByRole('alert').textContent(), 'Save temporarily unavailable');
  assert(await page.locator('#submitBtn').isEnabled());
  await page.evaluate(() => { window.rejectUpdate = false; });
  await page.locator('#submitBtn').click();
  await page.waitForURL(origin + '/onboarding/awaiting-approval.html');
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('roleUpdate')));
  assert.deepEqual({ ...saved, updated_at: 'timestamp' }, {
    full_name: 'Fictional User', id_number: '2024-1049', requested_role: 'faculty', updated_at: 'timestamp',
  });
  assert(Number.isFinite(Date.parse(saved.updated_at)));

  await page.goto(selectRole);
  await page.getByLabel('Full Name').fill('Student Tester');
  await page.getByLabel('School ID / Employee Number').fill('2026-1001');
  await page.getByLabel('Program', { exact: true }).selectOption('BSIT');
  await page.getByLabel('Year Level').selectOption('1st Year');
  await page.locator('#submitBtn').click();
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').textContent(), /valid student program and year level/);
  await page.getByLabel('Year Level').selectOption('2nd Year');
  await page.evaluate(() => { window.rejectUpdate = false; });
  await page.locator('#submitBtn').click();
  await page.waitForURL(origin + '/student/dashboard.html');
  const student = await page.evaluate(() => JSON.parse(sessionStorage.getItem('roleUpdate')));
  assert.equal(student.requested_role, 'student');
  assert.equal(student.program, 'BSIT');
  assert.equal(student.year_level, '2nd Year');

  mode = 'rejected';
  await page.goto(selectRole);
  await page.getByText('Your access request was not approved').waitFor();
  assert(await page.locator('#onboardForm').isHidden());
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(origin + '/auth/login.html');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('signedOut')), 'yes');
  mode = 'approved';
  await page.goto(selectRole);
  await page.waitForURL(origin + '/student/dashboard.html');
  mode = 'signed-out';
  await page.goto(selectRole);
  await page.waitForURL(origin + '/auth/login.html');
  assert.deepEqual(errors, []);
  console.log('Select Role: Tailwind layout, save and retry, blocked sign-out, and role redirects passed.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
