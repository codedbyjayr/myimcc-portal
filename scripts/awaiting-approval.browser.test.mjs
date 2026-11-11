import assert from 'node:assert/strict';
import { once } from 'node:events';
import { server } from './test-portal.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
process.env.TEST_PORTAL_UNTIL = new Date(Date.now() + 3600000).toISOString();
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const errors = [];

try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install();
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.fulfill({ body: '' });
    if (url.pathname === '/shared/supabase-config.js') {
      return route.fulfill({ contentType: 'text/javascript', body: `
        window.testApproval = { profile: { status: 'pending', role: 'pending', is_active: true }, reads: 0, user: { id: 'test-id' } };
        window.getSupabaseClientAsync = async () => ({
          auth: {
            getUser: async () => ({ data: { user: testApproval.user }, error: testApproval.authError }),
            signOut: async () => ({ error: testApproval.signOutError }),
          },
          from: table => {
            if (table !== 'profiles') throw new Error('Unexpected table');
            return { select: columns => {
              if (columns !== 'status, role, is_active') throw new Error('Unexpected columns');
              return { eq: (column, id) => {
                if (column !== 'id' || id !== 'test-id') throw new Error('Unexpected profile filter');
                return { single: async () => {
                  testApproval.reads++;
                  return { data: testApproval.profile, error: testApproval.profileError };
                } };
              } };
            } };
          },
        });` });
    }
    if (url.pathname === '/auth/login.html' || url.pathname === '/student/dashboard.html') {
      return route.fulfill({ contentType: 'text/html', body: '<h1>Destination</h1>' });
    }
    return route.continue();
  });

  await page.goto(origin + '/onboarding/awaiting-approval.html');
  await page.waitForFunction(() => window.testApproval.reads === 1);
  assert.equal(await page.locator('h1').textContent(), 'Account Pending Approval');
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page fits viewport');
    assert.equal(await page.locator('main').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(20, 16, 25)', 'Tailwind CSS is loaded');
  }
  await page.evaluate(() => { window.approvalMarker = true; });
  await page.clock.fastForward(20000);
  await page.waitForFunction(() => window.testApproval.reads === 2);
  assert(await page.evaluate(() => window.approvalMarker), 'Pending accounts never reload themselves');

  for (const [profile, title] of [
    [{ status: 'rejected', role: 'faculty', is_active: true }, 'Access Request Not Approved'],
    [{ status: 'approved', role: 'student', is_active: false }, 'Account Suspended'],
    [{ status: 'pending', role: 'pending', is_active: true }, 'Account Pending Approval'],
  ]) {
    await page.evaluate(profile => { window.testApproval.profile = profile; }, profile);
    await page.clock.fastForward(20000);
    await page.waitForFunction(title => document.querySelector('h1').textContent === title, title);
  }
  await page.evaluate(() => {
    window.testApproval.profileError = { message: 'Offline' };
    window.testApproval.profile = null;
  });
  await page.clock.fastForward(20000);
  await page.waitForFunction(() => window.testApproval.reads === 6);
  assert.equal(await page.locator('h1').textContent(), 'Account Pending Approval', 'Read failures keep the last known status');
  await page.evaluate(() => {
    window.testApproval.profileError = null;
    window.testApproval.profile = { status: 'approved', role: 'student', is_active: true };
  });
  await page.clock.fastForward(20000);
  await page.waitForURL(origin + '/student/dashboard.html');

  await page.goto(origin + '/onboarding/awaiting-approval.html');
  await page.locator('#signOutBtn').waitFor();
  await page.evaluate(() => { window.testApproval.signOutError = { message: 'Offline' }; });
  await page.locator('#signOutBtn').click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByRole('alert').textContent(), 'Unable to sign out. Please try again.');
  assert(await page.locator('#signOutBtn').isEnabled());
  await page.evaluate(() => { window.testApproval.signOutError = null; });
  await page.locator('#signOutBtn').click();
  await page.waitForURL(origin + '/auth/login.html');

  await page.goto(origin + '/onboarding/awaiting-approval.html');
  await page.waitForFunction(() => window.testApproval.reads === 1);
  await page.evaluate(() => {
    window.testApproval.user = null;
    window.testApproval.authError = { name: 'AuthSessionMissingError', message: 'Auth session missing!' };
  });
  await page.clock.fastForward(20000);
  await page.waitForURL(origin + '/auth/login.html');
  assert.deepEqual(errors, []);
  console.log('Approval page passes status polling, redirects, sign-out recovery, and responsive styling.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
