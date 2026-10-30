// Run with the existing browser tooling: node scripts/student-theme.browser.test.mjs
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
  : { channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' }) });
const output = new URL('../.temp/student-theme/', import.meta.url);
await mkdir(output, { recursive: true });

function contrast(foreground, background) {
  const luminance = color => {
    const [r, g, b] = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return r * 0.2126 + g * 0.7152 + b * 0.0722;
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

try {
  for (const root of ['../', '../review-assets/']) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 950 }, reducedMotion: 'reduce' });
    await page.route('**/*', route => route.abort());
    const source = new URL(root + 'student/dashboard.html', import.meta.url);
    const html = await readFile(source, 'utf8');
    await page.setContent(await page.evaluate(source => {
      const document = new DOMParser().parseFromString(source, 'text/html');
      document.querySelectorAll('script, link').forEach(element => element.remove());
      return '<!doctype html>' + document.documentElement.outerHTML;
    }, html));
    for (const path of ['dashboard.css', '../shared/loading.css', '../shared/rwd.css']) {
      await page.addStyleTag({ content: await readFile(new URL(path, source), 'utf8') });
    }
    // Exercise the real renderers and print handlers without auth or database access.
    const js = await readFile(new URL('dashboard.js', source), 'utf8');
    await page.addScriptTag({ content: `
      const getEl = id => document.getElementById(id);
      const escapeHtml = value => String(value);
      const peso = value => 'PHP ' + value;
      const fmtDate = () => 'Oct 30, 2026';
      const state = { page: 'cor' };
      window.print = () => window.dispatchEvent(new Event('beforeprint'));
      ${js.slice(js.indexOf('function renderCorPage(d)'), js.indexOf('// ── Clearance Module'))}
      ${js.slice(js.indexOf('function appendHelpTurn('), js.indexOf('async function askHelp('))}
    ` });
    await page.evaluate(() => {
      appendHelpTurn('user', 'How do I enroll?');
      appendHelpTurn('bot', 'Open enrollment.' + renderHelpSources([{ category: 'Enrollment', question: 'How do I enroll?' }]));
      document.querySelector('.help-sources').open = true;
      document.getElementById('helpInput').value = 'How do I enroll?';
      renderCorPage({ profile: { full_name: 'Fictional Student', student_no: 'TEST-001', program: 'BSIT', year_level: '4', email: 'student@example.invalid' },
        user: {}, activeSchoolYear: '2026-2027', activeSemester: '1st Semester',
        courses: [{ code: 'TEST101', title: 'Sample subject', units: 3, fee: 1000 }], miscFees: [], billing: { total_paid: 0, balance: 1000 }, sigs: {} });
    });
    const colors = selector => page.locator(selector).first().evaluate(element => {
      const css = getComputedStyle(element);
      let background = element;
      while (getComputedStyle(background).backgroundColor === 'rgba(0, 0, 0, 0)' && background.parentElement) background = background.parentElement;
      return { foreground: css.color, background: getComputedStyle(background).backgroundColor };
    });
    let lightPrint;
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = document.body.dataset.theme = theme, theme);
      await page.evaluate(() => document.getElementById('chatPanel').showPopover());
      for (const selector of ['.msg-item-bot .msg-item-body', '.msg-item-bot .msg-item-head', '.msg-item.mine .msg-item-body', '#helpInput', '.help-chip', '.help-sources summary', '.help-sources li', '.help-footnote', '.cor-doc th']) {
        const { foreground, background } = await colors(selector);
        assert(contrast(foreground, background) >= 4.5, `${root}${theme} ${selector}: needs 4.5:1 contrast`);
      }
      if (root === '../' && theme === 'dark') {
        await page.screenshot({ path: fileURLToPath(new URL('assistant-dark.png', output)), animations: 'disabled' });
        await page.setViewportSize({ width: 390, height: 844 });
        const bounds = await page.locator('#chatPanel').boundingBox();
        assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 390 && bounds.y + bounds.height <= 844);
        await page.screenshot({ path: fileURLToPath(new URL('assistant-dark-mobile.png', output)), animations: 'disabled' });
        await page.setViewportSize({ width: 1200, height: 950 });
      }
      await page.evaluate(() => {
        document.getElementById('chatPanel').hidePopover();
        document.querySelectorAll('.page').forEach(element => element.classList.remove('active'));
        document.getElementById('page-cor').classList.add('active');
      });
      for (const entry of ['button', 'keyboard']) {
        await page.setViewportSize({ width: 794, height: 1123 });
        await page.emulateMedia({ media: 'print' });
        await page.evaluate(entry => entry === 'button' ? printCorPage() : window.dispatchEvent(new Event('beforeprint')), entry);
        assert(await page.locator('body').evaluate(element => element.classList.contains('is-printing-cor')));
        const printed = [];
        for (const selector of ['.cor-doc', '.cor-info-grid', '.cor-summary-card', '.cor-doc th', '.cor-doc td', '.cor-summary-row', '.cor-sig-line', '.cor-doc-footer']) {
          const pair = await colors(selector);
          assert(contrast(pair.foreground, pair.background) >= 4.5, `${theme} printed ${selector}: needs 4.5:1 contrast`);
          printed.push(pair);
        }
        assert.equal(printed[0].background, 'rgb(255, 255, 255)', 'COR paper stays white');
        if (!lightPrint) lightPrint = printed;
        assert.deepEqual(printed, lightPrint, 'Print palette must match across themes and print entry points');
        if (root === '../' && theme === 'dark' && entry === 'button') await page.screenshot({ path: fileURLToPath(new URL('cor-print.png', output)), animations: 'disabled' });
        await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
        await page.emulateMedia({ media: 'screen' });
        await page.setViewportSize({ width: 1200, height: 950 });
        assert.equal(await page.locator('body').getAttribute('data-theme'), theme);
        assert.equal(await page.locator('.cor-doc').evaluate(element => element.style.zoom), '');
        assert.equal((await colors('.cor-doc')).background, theme === 'dark' ? 'rgb(28, 22, 35)' : 'rgb(255, 255, 255)');
      }
    }
    await page.close();
  }
  console.log('Student themes: assistant contrast, mobile popover, COR headers, white print from both themes/entry points, cleanup and demo passed.');
} finally {
  await browser.close();
}
