import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { server } from './test-portal.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
await mkdir('.temp/dashboard-boundary', { recursive: true });
await writeFile('.temp/dashboard-boundary/fixture.tsx', `
  import { createRoot } from 'react-dom/client';
  import { DashboardWorkspace } from '../../shared/dashboard-workspace';
  const root = createRoot(document.getElementById('root'));
  window.renderWorkspace = markup => root.render(<DashboardWorkspace markup={markup} />);
  window.renderWorkspace('<input id="draft" value="original"><button id="save">Save</button>');
`);
await build({
  configFile: false, envDir: false, publicDir: false, logLevel: 'error',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [tailwindcss()],
  build: {
    outDir: '.temp/dashboard-boundary/dist', minify: true,
    lib: { entry: '.temp/dashboard-boundary/fixture.tsx', name: 'WorkspaceCheck', formats: ['iife'], fileName: () => 'fixture.js', cssFileName: 'fixture' },
  },
});
const fixture = await readFile('.temp/dashboard-boundary/dist/fixture.js', 'utf8');
process.env.TEST_PORTAL_UNTIL = new Date(Date.now() + 3600000).toISOString();
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
try {
  const page = await browser.newPage();
  const errors = [];
  let failedScript;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/first-controller.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    if (!document.getElementById('save')) throw new Error('Controller started before markup mounted');
    window.controllerStarts = (window.controllerStarts || 0) + 1;
    window.saves = 0;
    document.getElementById('save').addEventListener('click', () => window.saves++);
  ` }));
  await page.route('**/failed-controller.js', route => { failedScript = route; });
  await page.route('**/workspace-fixture.js', route => route.fulfill({ contentType: 'text/javascript', body: fixture }));
  await page.route('**/workspace-check', route => route.fulfill({ contentType: 'text/html', body: `
    <div id="root"></div>
    <script src="/first-controller.js" type="text/imcc-controller" data-dashboard-controller></script>
    <script src="/failed-controller.js" type="text/imcc-controller" data-dashboard-controller></script>
    <script src="/workspace-fixture.js"></script>
  ` }));
  await page.goto(origin + '/workspace-check', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.controllerStarts === 1);
  await page.locator('#draft').fill('unsaved grade');
  await page.waitForFunction(() => document.querySelectorAll('script[src$="failed-controller.js"]').length === 2);
  await failedScript.abort();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.locator('#draft').inputValue(), 'unsaved grade', 'Error-state renders preserve controller-owned edits');
  await page.evaluate(() => window.renderWorkspace('<p>Replacement markup must not overwrite an active workspace</p>'));
  await page.locator('#save').click();
  assert.equal(await page.locator('#draft').inputValue(), 'unsaved grade');
  assert.equal(await page.evaluate(() => window.controllerStarts), 1, 'React updates never initialize a controller twice');
  assert.equal(await page.evaluate(() => window.saves), 1, 'Save listeners remain attached once');
  assert.deepEqual(errors, []);
  console.log('Dashboard boundary: mounted initialization, single listeners, script failure, and unsaved edits across React updates passed.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
