// Run with the existing browser tooling: node scripts/student-grades-layout.browser.test.mjs
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
  : { channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' }) });
const output = new URL('../.temp/student-grades-layout/', import.meta.url);
await mkdir(output, { recursive: true });
try {
  for (const root of ['../', '../review-assets/']) {
    const source = new URL(root + 'student/dashboard.html', import.meta.url);
    const html = await readFile(source, 'utf8');
    const js = await readFile(new URL('dashboard.js', source), 'utf8');
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await page.route('**/*', route => route.abort());
    await page.setContent(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, ''));
    for (const path of ['dashboard.css', '../shared/loading.css', '../shared/rwd.css']) await page.addStyleTag({ content: await readFile(new URL(path, source), 'utf8') });
    await page.addScriptTag({ content: await readFile(new URL('../shared/grading.js', source), 'utf8') });
    await page.addScriptTag({ content: `
      const state = { studentProfile: { program: 'BSIT', year_level: '4' }, grades: [
        {code:'FIRST101',title:'First term',year:1,school_year:'2026-2027',semester:'1st Semester',grade_scale:'school',final:1,units:3},
        {code:'SUMMER101',title:'Summer term',year:2,school_year:'2026-2027',semester:'Summer',grade_scale:'school',final:2,units:3}
      ] };
      const getEl = id => document.getElementById(id);
      const setText = (id, text) => { const element = getEl(id); if (element) element.textContent = text; };
      const escapeHtml = value => String(value);
      let _gradesSelectedTerm = null;
      ${js.slice(js.indexOf('function gradesForSelectedTerm()'), js.indexOf('async function loadGrades()'))}
      ${js.slice(js.indexOf('function predictedGwa('), js.indexOf('// ── Degree Prospectus Modal'))}
      buildGradesTermDropdown(); renderGrades(); renderGradeStats(); renderGradesHeader();
      document.querySelectorAll('.page').forEach(element => element.classList.remove('active'));
      getEl('page-grades').classList.add('active');
    ` });
    assert.equal(await page.locator('#gradesTermPill').count(), 0);
    assert.equal(await page.locator('.grades-tools #gradeTermSelect').count(), 1);
    await page.selectOption('#gradeTermSelect', '2026-2027|1st Semester');
    assert((await page.locator('#gradesBody').textContent()).includes('FIRST101'));
    assert(!(await page.locator('#gradesBody').textContent()).includes('SUMMER101'));
    await page.selectOption('#gradeTermSelect', '2026-2027|Summer');
    assert((await page.locator('#gradesTitle').textContent()).includes('Summer'));
    assert((await page.locator('#gradesBody').textContent()).includes('SUMMER101'));
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => document.documentElement.dataset.theme = document.body.dataset.theme = theme, theme);
        const boxes = await Promise.all(['#gradesTitle', '#gradeTermSelect', '#gradeYearFilter', '#prospectusBtn'].map(selector => page.locator(selector).boundingBox()));
        assert(boxes.every(box => box && box.x >= 0 && box.x + box.width <= width));
        assert(boxes[1].y >= boxes[0].y + boxes[0].height, 'Filters sit below the title');
        if (width === 390) assert(boxes[2].y >= boxes[1].y + boxes[1].height, 'Mobile filters stack');
        else assert(Math.abs(boxes[1].y - boxes[2].y) <= 1, 'Desktop filters align');
        if (root === '../') await page.screenshot({ path: fileURLToPath(new URL(`${width}-${theme}.png`, output)), animations: 'disabled' });
      }
    }
    await page.close();
  }
  console.log('Student grades layout: duplicate badge removed, semester switching, desktop alignment, mobile stacking and both themes/demo passed.');
} finally { await browser.close(); }
