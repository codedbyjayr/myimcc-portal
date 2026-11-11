import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { server } from './test-portal.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [rootHtml, loginHtml] = await Promise.all(['index.html', 'auth/login.html']
  .map(path => readFile(new URL('../' + path, import.meta.url), 'utf8')));
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
process.env.TEST_PORTAL_UNTIL = new Date(Date.now() + 3600000).toISOString();
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const errors = [];
let startupFails = true;
let hasVerifiedFactor = true;
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: rootHtml });
    if (url.pathname === '/auth/login.html') return route.fulfill({ contentType: 'text/html', body: loginHtml });
    if (url.pathname === '/env-config.js') return route.fulfill({ contentType: 'text/javascript', body: '' });
    if (url.pathname === '/faculty/teacher-dashboard.html') return route.fulfill({ contentType: 'text/html', body: '<h1>Teacher dashboard</h1>' });
    if (url.pathname !== '/shared/supabase-config.js') return route.continue();
    return route.fulfill({ contentType: 'text/javascript', body: `
      const user = { id: 'test-instructor', email: 'test-instructor@imcc.edu.ph' };
      const session = { user };
      const callbackUrl = location.search + location.hash;
      let inAuthCallback = false;
      function assertCallbackReturned() {
        if (inAuthCallback) throw new Error('MFA must wait until the auth listener returns');
      }
      window.loginFixture = { callbackUrl, challenges: 0 };
      window.getSupabaseClientAsync = async () => {
        if (${startupFails}) throw new Error('Configuration unavailable');
        return {
          from: () => ({
            select() { return this; },
            eq() { return this; },
            single: async () => ({ data: { role: 'faculty', status: 'approved', is_active: true } }),
          }),
          auth: {
            onAuthStateChange(callback) {
              if (!callbackUrl.includes('code=fixture')) return;
              queueMicrotask(() => {
                inAuthCallback = true;
                try {
                  if (callback('SIGNED_IN', session) !== undefined) throw new Error('Expected synchronous callback');
                  callback('INITIAL_SESSION', session);
                } finally { inAuthCallback = false; }
              });
            },
            signInWithOAuth: async options => {
              loginFixture.oauth = options;
              return { error: { message: 'Test Google response' } };
            },
            getUser: async () => ({ data: { user } }),
            mfa: {
              getAuthenticatorAssuranceLevel: async () => {
                assertCallbackReturned();
                return { data: { currentLevel: 'aal1' } };
              },
              listFactors: async () => ({ data: { totp: ${hasVerifiedFactor} ? [{ id: 'factor', status: 'verified' }] : [] } }),
              enroll: async () => ({ data: { id: 'factor', totp: { secret: 'FICTIONAL', qr_code: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E' } } }),
              challenge: async ({ factorId }) => {
                if (factorId !== 'factor') throw new Error('Unexpected factor');
                loginFixture.challenges++;
                return { data: { id: 'challenge' } };
              },
              verify: async ({ factorId, challengeId, code }) => {
                if (factorId !== 'factor' || challengeId !== 'challenge' || code !== '123456') throw new Error('Incorrect code or challenge');
                return { data: {} };
              },
            },
          },
        };
      };
    ` });
  });

  await page.goto(origin + '/auth/login.html');
  await page.getByRole('alert').filter({ hasText: 'Sign-in is temporarily unavailable' }).waitFor();
  assert(await page.locator('#ssoBtn').isDisabled());
  await page.getByText('Undergraduate Programs', { exact: true }).waitFor();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  startupFails = false;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await page.getByRole('heading', { name: 'Academic Gateway' }).waitFor();
  await page.locator('#emailInput').fill('test-instructor@imcc.edu.ph');
  await page.locator('#ssoBtn').click();
  await page.getByRole('alert').filter({ hasText: 'Test Google response' }).waitFor();
  assert.deepEqual(await page.evaluate(() => loginFixture.oauth), {
    provider: 'google',
    options: {
      queryParams: { hd: 'imcc.edu.ph', login_hint: 'test-instructor@imcc.edu.ph' },
      redirectTo: origin + '/auth/login.html',
    },
  });

  await page.goto(origin + '/?code=fixture#forwarded');
  await page.getByRole('heading', { name: 'Two-Factor Verification' }).waitFor();
  assert.equal(await page.evaluate(() => loginFixture.callbackUrl), '?code=fixture#forwarded');
  assert.equal(page.url(), origin + '/auth/login.html');
  assert.equal(await page.evaluate(() => loginFixture.challenges), 1);
  assert(await page.locator('#challengeCodeInput').evaluate(input => input === document.activeElement));
  await page.locator('#challengeCodeInput').fill('123456');
  await page.locator('#challengeBtn').click();
  await page.waitForURL(origin + '/faculty/teacher-dashboard.html');

  hasVerifiedFactor = false;
  await page.goto(origin + '/auth/login.html?code=fixture');
  await page.getByRole('heading', { name: 'Sync 2FA App' }).waitFor();
  assert(await page.locator('#skipEnrollBtn').isHidden(), 'Faculty MFA setup is required');
  await page.locator('#enrollCodeInput').fill('123456');
  await page.locator('#enrollBtn').click();
  await page.waitForURL(origin + '/faculty/teacher-dashboard.html');
  assert.deepEqual(errors, []);
  console.log('Login UI: startup failure, responsive layout, OAuth parameters, callback forwarding, MFA challenge/setup, and faculty routing passed.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
