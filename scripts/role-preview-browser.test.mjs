import assert from 'node:assert/strict';
import { once } from 'node:events';
import { server } from './test-portal.mjs';

// Use an existing Playwright installation; this check adds no app dependency.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(origin)
    ? route.continue() : route.abort());
  // A plain document lets us exercise the builder without signing in or mocking a session.
  await page.goto(origin + '/env-config.js');
  const paths = {
    Student: '/student/dashboard.html', Faculty: '/faculty/teacher-dashboard.html',
    Dean: '/faculty/dean-dashboard.html', Registrar: '/staff/registrar-dashboard.html',
    Staff: '/staff/staff-dashboard.html', Admin: '/admin/admin-dashboard.html',
  };
  for (const [role, path] of Object.entries(paths)) {
    await page.evaluate(async ({ path, role }) => {
      const { buildPreview } = await import('/admin/role-preview.js');
      const source = await (await fetch(path)).text();
      document.querySelectorAll('iframe').forEach(el => el.remove());
      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-scripts');
      iframe.style.cssText = 'width:100%;height:900px;border:0';
      iframe.srcdoc = buildPreview(source, new URL(path, location.origin).href, role);
      document.body.replaceChildren(iframe);
    }, { path, role });
    const frameElement = await page.locator('iframe').elementHandle();
    const frame = await frameElement.contentFrame();
    await frame.waitForSelector('[role="status"]');
    await frame.waitForLoadState('load');
    assert((await frame.locator('[role="status"]').last().textContent()).includes('READ ONLY'));
    assert.equal(await frame.locator('script').count(), 1, 'Only preview navigation script remains');
    assert.equal(await frame.locator('a[href]').count(), 0);
    assert.equal(await frame.locator('input:enabled,select:enabled,textarea:enabled').count(), 0);
    const isolation = await frame.evaluate(async () => {
      let parentBlocked = false, storageBlocked = false, networkBlocked = false;
      try { void parent.document; } catch { parentBlocked = true; }
      try { void localStorage.length; } catch { storageBlocked = true; }
      try { await fetch('/api/should-never-run', { method: 'POST' }); } catch { networkBlocked = true; }
      return { parentBlocked, storageBlocked, networkBlocked };
    });
    assert.deepEqual(isolation, { parentBlocked: true, storageBlocked: true, networkBlocked: true });
    const buttons = frame.locator('[data-page],[data-view]');
    for (let i = 0; i < await buttons.count(); i++) {
      const button = buttons.nth(i);
      const name = await button.getAttribute('data-page') || await button.getAttribute('data-view');
      const panel = frame.locator('#page-' + name + ',#view-' + name);
      if (await panel.count() !== 1) continue;
      await button.click();
      assert(await panel.isVisible(), `${role}: ${name} navigation must show its section: ${JSON.stringify(await panel.evaluate(el => ({ class: el.className, hidden: el.hidden, style: el.getAttribute('style'), display: getComputedStyle(el).display })))}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = frame.locator('#menuToggle');
    if (await mobile.count()) {
      await mobile.click();
      assert((await frame.locator('#sidebar').getAttribute('class')).includes('open'));
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    console.log(`${role}: layout, section navigation and sandbox isolation passed.`);
  }
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.fulfill({
    contentType: 'text/javascript', body: `window.supabase = { createClient() { return { auth: {
      getSession: async () => ({ data: { session: { access_token: 'local-browser-test' } } }),
      onAuthStateChange() {}
    } }; } };`,
  }));
  let denyAccess = false;
  await page.route(origin + '/api/developer-preview', route => route.fulfill({
    status: denyAccess ? 403 : 200, contentType: 'application/json',
    body: JSON.stringify(denyAccess ? { error: 'Preview access denied.' } : {
      dashboards: Object.fromEntries(Object.entries(paths).map(([role, path]) => [role.toLowerCase(), path])),
    }),
  }));
  await page.goto(origin + '/admin/role-preview.html');
  await page.locator('#previewFrame').waitFor({ state: 'visible' });
  assert((await page.locator('#previewStatus').textContent()).includes('Viewing as Student'));
  await page.frameLocator('#previewFrame').getByText('Viewing as Student — READ ONLY · No personal records', { exact: true }).waitFor();
  for (const role of Object.keys(paths)) {
    await page.selectOption('#previewRole', role.toLowerCase());
    await page.getByText('Viewing as ' + role + ' — read only', { exact: true }).waitFor();
    await page.locator('#previewFrame').waitFor({ state: 'visible' });
    assert((await page.locator('#previewStatus').textContent()).includes('Viewing as ' + role));
    await page.frameLocator('#previewFrame').getByText(`Viewing as ${role} — READ ONLY · No personal records`, { exact: true }).waitFor();
  }
  await page.selectOption('#previewRole', 'student');
  await page.getByText('Viewing as Student — read only', { exact: true }).waitFor();
  await page.locator('#previewFrame').waitFor({ state: 'visible' });
  await page.frameLocator('#previewFrame').getByText('Viewing as Student — READ ONLY · No personal records', { exact: true }).waitFor();
  if (process.env.PREVIEW_SCREENSHOT) await page.screenshot({ path: process.env.PREVIEW_SCREENSHOT });
  denyAccess = true;
  await page.reload();
  await page.getByText('Preview access denied.', { exact: true }).waitFor();
  assert(await page.locator('#previewFrame').isHidden());
  assert.equal(await page.locator('#previewFrame').getAttribute('srcdoc'), null);
  console.log('Viewer: all role selections, read-only status, and denied-access behavior passed.');
  assert.deepEqual(browserErrors, [], 'No uncaught browser errors');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
