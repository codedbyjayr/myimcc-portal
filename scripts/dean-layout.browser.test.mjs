import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
  : { channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' }) });
const output = new URL('../.temp/dean-layout/', import.meta.url);
await mkdir(output, { recursive: true });
try {
  for (const root of ['../', '../review-assets/']) {
    const source = new URL(root + 'faculty/dean-dashboard.html', import.meta.url);
    const html = await readFile(source, 'utf8');
    const js = await readFile(new URL('dean-dashboard.js', source), 'utf8');
    assert(!html.includes('Choose a student to view clearance.'));
    assert(!html.includes('Appeals &amp; Approvals'));
    assert(!js.includes('loadAppeals') && !js.includes("from('appeals')"));
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    await page.route('**/*', route => route.abort());
    await page.setContent(await page.evaluate(source => {
      const document = new DOMParser().parseFromString(source, 'text/html');
      document.querySelectorAll('script, link').forEach(element => element.remove());
      return '<!doctype html>' + document.documentElement.outerHTML;
    }, html));
    for (const path of ['sharedstyle.css', 'subject-picker.css', '../shared/loading.css', '../shared/rwd.css']) await page.addStyleTag({ content: await readFile(new URL(path, source), 'utf8') });
    await page.evaluate(() => {
      document.querySelectorAll('.page').forEach(element => element.classList.remove('active'));
      document.getElementById('page-faculty').classList.add('active');
      document.getElementById('assignSemesterFilter').innerHTML = '<option>1st Semester — 2026-2027</option>';
    });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => document.documentElement.dataset.theme = document.body.dataset.theme = theme, theme);
        const button = page.locator('[data-modal="courseOffering"]');
        const box = await button.boundingBox();
        assert(box.height <= 48, 'Offering button stays compact');
        assert(box.x >= 0 && box.x + box.width <= width, 'Offering button stays in the viewport');
        assert(await button.evaluate(element => getComputedStyle(element).whiteSpace === 'nowrap' && element.scrollWidth <= element.clientWidth), 'Button label fits on one line');
        assert.equal(await page.locator('#clearanceDetails').textContent(), '');
        if (root === '../') await page.screenshot({ path: fileURLToPath(new URL(`${width}-${theme}.png`, output)), animations: 'disabled' });
      }
    }
    await page.close();
  }
  console.log('Dean layout: removed clearance prompt/appeals, compact offering button, desktop/mobile and both themes/demo passed.');
} finally { await browser.close(); }
