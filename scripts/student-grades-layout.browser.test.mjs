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
    await page.route('https://grades.test/shared/dist/*.js', route => route.fulfill({
      path: fileURLToPath(new URL('.' + new URL(route.request().url()).pathname, new URL('..', source))),
      contentType: 'text/javascript',
    }));
    await page.route('https://grades.test/student/dashboard.html', route => route.fulfill({
      contentType: 'text/html',
      body: html.replace(/<link\b[^>]*>/g, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,
        script => script.includes('type="module"') ? script : ''),
    }));
    await page.goto('https://grades.test/student/dashboard.html');
    await page.locator('#gradesBody').waitFor({ state: 'attached' });
    assert.equal(await page.locator('#gradesLoadMessage').textContent(), 'Loading grades…');
    for (const path of ['dashboard.css', '../shared/loading.css', '../shared/rwd.css', '../shared/dist/portal.css']) {
      await page.addStyleTag({ content: await readFile(new URL(path, source), 'utf8') });
    }
    await page.addScriptTag({ content: await readFile(new URL('../shared/grading.js', source), 'utf8') });
    await page.addScriptTag({ content: `
      const state = { studentProfile: { id: 'student', program: 'BSIT', year_level: '4' }, grades: null };
      let gradeRead = { error: { message: 'Unavailable' } };
      const supabaseClient = { from: () => ({ select: () => ({ eq: async () => gradeRead }) }) };
      const getEl = id => document.getElementById(id);
      const setText = (id, text) => { const element = getEl(id); if (element) element.textContent = text; };
      const loadFacultyEval = () => {};
      const showToast = () => {};
      ${js.slice(js.indexOf("getEl('gradeYearFilter')"), js.indexOf('// ── Degree Prospectus Modal'))}
      document.querySelectorAll('.page').forEach(element => element.classList.remove('active'));
      getEl('page-grades').classList.add('active');
    ` });
    await page.evaluate(() => loadGrades());
    assert.match(await page.locator('#gradesBody').textContent(), /Could not load grades/);
    await page.evaluate(async () => {
      gradeRead = { data: [
        { grade_scale: 'school', final: 1, equivalent: 1, course_offerings: { code: 'FIRST101', title: 'First term', year: 1, school_year: '2026-2027', semester: '1st Semester', units: 3 } },
        { grade_scale: 'school', final: 2, equivalent: 2, course_offerings: { code: 'SUMMER101', title: 'Summer term', year: 2, school_year: '2026-2027', semester: 'Summer', units: 3 } },
      ] };
      await loadGrades();
    });
    assert.equal(await page.locator('#gradesTermPill').count(), 0);
    assert.equal(await page.getByLabel('Semester', { exact: true }).count(), 1);
    await page.selectOption('#gradeTermSelect', '2026-2027|1st Semester');
    assert((await page.locator('#gradesBody').textContent()).includes('FIRST101'));
    assert(!(await page.locator('#gradesBody').textContent()).includes('SUMMER101'));
    await page.selectOption('#gradeTermSelect', '2026-2027|Summer');
    assert((await page.locator('#gradesTitle').textContent()).includes('Summer'));
    assert((await page.locator('#gradesBody').textContent()).includes('SUMMER101'));
    await page.selectOption('#gradeYearFilter', '1');
    assert.match(await page.locator('#gradesBody').textContent(), /No grades recorded/);
    await page.selectOption('#gradeYearFilter', '');
    assert.equal(await page.locator('#grade-gwa').textContent(), '2.00');
    await page.evaluate(async () => {
      gradeRead = { error: { message: 'Unavailable' } };
      await loadGrades();
    });
    assert.match(await page.locator('#gradesBody').textContent(), /SUMMER101/);
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
