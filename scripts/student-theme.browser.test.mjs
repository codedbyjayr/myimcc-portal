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

let glassContrast = Infinity;
try {
  for (const root of ['../', '../review-assets/']) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 950 }, reducedMotion: 'reduce' });
    await page.route('**/*', route => route.abort());
    const source = new URL(root + 'student/dashboard.html', import.meta.url);
    await page.route('https://portal.test/logo.png', async route => {
      await route.fulfill({ contentType: 'image/png', body: await readFile(new URL('../logo.png', source)) });
    });
    await page.route(url => url.pathname === '/fixture-avatar.png', async route => {
      await route.fulfill({ contentType: 'image/png', body: await readFile(new URL('../logo.png', source)) });
    });
    await page.route('https://portal.test/student/icons/clearance/*.png', async route => {
      const filename = new URL(route.request().url()).pathname.split('/').pop();
      await route.fulfill({ contentType: 'image/png', body: await readFile(new URL('icons/clearance/' + filename, source)) });
    });
    const html = await readFile(source, 'utf8');
    await page.route('https://portal.test/shared/dist/*.js', route => route.fulfill({
      path: fileURLToPath(new URL('.' + new URL(route.request().url()).pathname, new URL('..', source))),
      contentType: 'text/javascript',
    }));
    await page.route('https://portal.test/student/dashboard.html', route => route.fulfill({
      contentType: 'text/html',
      body: html.replace(/<link\b[^>]*>/g, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,
        script => script.includes('type="module"') ? script : ''),
    }));
    await page.goto('https://portal.test/student/dashboard.html');
    await page.locator('#deptGrid').waitFor({ state: 'attached' });
    for (const path of ['dashboard.css', '../shared/loading.css', '../shared/rwd.css', '../shared/dist/portal.css']) {
      await page.addStyleTag({ content: await readFile(new URL(path, source), 'utf8') });
    }
    // Exercise the real renderers and print handlers without auth or database access.
    const js = await readFile(new URL('dashboard.js', source), 'utf8');
    await page.addScriptTag({ content: `
      const getEl = id => document.getElementById(id);
      const setText = (id, value) => { const element = getEl(id); if (element) element.textContent = value ?? '—'; };
      ${js.slice(js.indexOf('function getTimeGreeting('), js.indexOf('// ── Auth Guard'))}
      const peso = value => 'PHP ' + value;
      const fmtDate = () => 'Oct 30, 2026';
      const Grading = { weightedGwa: () => 1.75 };
      const state = { page: 'cor', studentProfile: { id: 'student', full_name: 'Fictional Student', student_no: 'TEST-001',
        program: 'BSIT', year_level: '4', email: 'student@example.invalid' } };
      const savedProfile = { ...state.studentProfile, phone: '09123456789', address: 'Iligan City',
        avatar_url: ${JSON.stringify('https://portal.test/fixture-avatar.png?tag=" onerror="window.avatarInjected=true')} };
      Object.assign(state.studentProfile, savedProfile);
      let profileSaveFailure = true;
      let dashboardReadFailure = '';
      let clearanceRead = { error: { message: 'Unavailable' } };
      let corReadFailure = true;
      const corRecords = {
        announcements: [{ id: 'announcement', content: 'Enrollment is open <now>', deadline: '2026-10-30' }],
        deadlines: [{ id: 'deadline', title: 'Subject advising', type: 'urgent', due_date: '2026-10-30' }],
        student_semesters: { school_year: '2026-2027', semester: '1st Semester', balance: 12450, units_enrolled: 21, subjects_enrolled: 7 },
        activities: [{ id: 'one', description: 'Enrollment confirmed', color: '#E7338A', created_at: '2026-10-30' }],
        enrollments: Array.from({ length: 10 }, (_, index) => ({ course_offerings: {
          code: 'TEST' + (101 + index), title: 'Sample subject ' + (index + 1), units: 3, fee: 1000,
          schedule: 'MWF 09:00–10:00', instructor_name: 'Test Instructor', school_year: '2026-2027', semester: '1st Semester',
        } })),
        misc_fees: [{ name: 'Library fee', amount: 100 }], billing_summary: { total_paid: 1000, balance: 8750 },
        installments: [],
        transactions: [{ or_number: ${JSON.stringify("OR,123'\"<sample>")}, description: 'Paid "in full", sample',
          channel: '=1+1', amount: 50 }],
        system_settings: [{ key: 'cor_cashier_name', value: 'Test Cashier' }, { key: 'cor_registrar_name', value: 'Test Registrar' }],
      };
      const supabaseClient = {
        auth: { getUser: async () => ({ data: { user: { id: 'student' } } }) },
        from: table => {
          let profileUpdate;
          const result = () => table === 'clearances' ? clearanceRead
            : table === dashboardReadFailure || (corReadFailure && table === 'enrollments')
            ? { data: null, error: { message: 'Read failed' } } : { data: corRecords[table] };
          return { select() { return this; }, eq() { return this; }, in() { return this; },
            order() { return this; }, limit() { return this; }, update(values) { profileUpdate = values; return this; },
            single: async () => {
              if (table !== 'profiles') throw new Error('Unexpected profile request');
              if (profileUpdate && profileSaveFailure) return { error: { message: 'Save unavailable' } };
              Object.assign(savedProfile, profileUpdate);
              return { data: { ...savedProfile } };
            },
            maybeSingle: async () => table === 'installments' && dashboardReadFailure !== 'installments'
              ? { data: corRecords.installments[0] || null } : result(),
            then: resolve => Promise.resolve(result()).then(resolve) };
        },
      };
      const console = { error() {} };
      const closeMobileNav = () => {};
      ${js.slice(js.indexOf('function goto('), js.indexOf('// ── Dropdowns Setup'))}
      ${js.slice(js.indexOf('async function loadDashboard('), js.indexOf('// ── Announcements, Deadlines'))}
      ${js.slice(js.indexOf('async function loadAnnouncements('), js.indexOf('async function loadNotifications('))}
      ${js.slice(js.indexOf('async function loadProfile('), js.indexOf('// ── Messages ──'))}
      ${js.slice(js.indexOf('function studentBillingBalance('), js.indexOf("getEl('gradeYearFilter')"))}
      ${js.slice(js.indexOf('function showReadFailure('), js.indexOf('async function loadAttendance()'))}
      ${js.slice(js.indexOf('// Clearance shortcuts are rendered'), js.indexOf('// One assistant owns'))}
      window.print = () => window.dispatchEvent(new Event('beforeprint'));
      ${js.slice(js.indexOf('// ── Certificate of Registration (COR) Page'), js.indexOf('// ── Clearance Module'))}
      ${js.slice(js.indexOf('function appendHelpTurn('), js.indexOf('async function askHelp('))}
      ${js.slice(js.indexOf("getEl('retryClearance')"), js.indexOf('// NOTE: adminClear()'))}
    ` });
    await page.evaluate(() => {
      appendHelpTurn('user', 'How do I enroll?');
      appendHelpTurn('bot', 'Open enrollment.' + renderHelpSources([{ category: 'Enrollment', question: 'How do I enroll?' }]));
      document.querySelector('.help-sources').open = true;
      document.getElementById('helpInput').value = 'How do I enroll?';
      document.getElementById('page-cor').classList.add('active');
    });
    await page.evaluate(() => loadCor());
    assert(await page.locator('#corPrintBtn').isDisabled());
    assert.equal(await page.locator('.cor-doc').count(), 0, 'An incomplete read cannot produce a printable COR');
    await page.evaluate(() => { corReadFailure = false; });
    await page.locator('#corRetryBtn').click();
    await page.locator('.cor-doc').waitFor();
    assert(await page.locator('#corPrintBtn').isEnabled());
    assert.equal(await page.locator('.cor-doc tbody tr').count(), 10);
    assert.match(await page.locator('.cor-doc').textContent(), /PHP 10100/);
    assert.match(await page.locator('.cor-doc').textContent(), /PHP 8750/);
    await page.waitForFunction(() => document.querySelector('.cor-logo-img').naturalWidth > 0);

    await page.evaluate(async () => { goto('profile'); await loadProfile(); await loadDashboard(); });
    for (const id of ['profileAvatar', 'sidebarAvatar', 'topAvatar']) {
      const avatar = page.locator(`#${id} img`);
      assert.match(await avatar.getAttribute('src'), /%22/);
      assert.equal(await avatar.getAttribute('onerror'), null);
    }
    await page.evaluate(() => { state.studentProfile.avatar_url = '/missing-avatar.png'; loadProfile(); renderDashboard(); });
    for (const id of ['profileAvatar', 'sidebarAvatar', 'topAvatar']) {
      await page.waitForFunction(id => document.getElementById(id).textContent === 'FS', id);
    }
    assert.equal(await page.evaluate(() => window.avatarInjected), undefined);
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.locator('#page-profile').evaluate(element => element.scrollWidth <= element.clientWidth + 1));
    for (const label of ['Phone Number', 'Address', 'Avatar URL']) await page.getByLabel(label, { exact: true }).fill('');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await page.waitForFunction(() => document.getElementById('toastMsg').textContent.includes('Save unavailable'));
    assert.equal(await page.getByLabel('Phone Number').inputValue(), '');
    await page.evaluate(() => { profileSaveFailure = false; });
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await page.waitForFunction(() => document.getElementById('toastMsg').textContent === 'Profile updated successfully');
    assert.deepEqual(await page.evaluate(() => [savedProfile.phone, savedProfile.address, savedProfile.avatar_url]), [null, null, null]);
    await page.evaluate(async () => {
      state.studentProfile = (await supabaseClient.from('profiles').select('*').eq('id', 'student').single()).data;
      await loadProfile();
      goto('dashboard');
    });
    assert.equal(await page.locator('#profilePhone').textContent(), '—');
    assert.equal(await page.locator('#profileAddress').textContent(), '—');
    assert.equal(await page.locator('#profileAvatar').textContent(), 'FS');
    for (const [failure, balance, due] of [
      ['', 12450, 'No upcoming payment scheduled'],
      ['installments', 12450, 'Payment schedule unavailable'],
      ['student_semesters', 12450, 'Balance unavailable'],
      ['', 0, 'All settled ✓'],
    ]) {
      await page.evaluate(async ({ failure, balance }) => {
        dashboardReadFailure = failure;
        corRecords.student_semesters.balance = balance;
        await loadDashboard();
      }, { failure, balance });
      assert.equal(await page.locator('#stat-due').textContent(), due);
      if (failure === 'student_semesters') assert.equal(await page.locator('#stat-balance').textContent(), '—');
    }
    const colors = selector => page.locator(selector).first().evaluate(element => {
      const css = getComputedStyle(element);
      let background = element;
      while (getComputedStyle(background).backgroundColor === 'rgba(0, 0, 0, 0)' && background.parentElement) background = background.parentElement;
      return { foreground: css.color, background: getComputedStyle(background).backgroundColor };
    });
    let lightPrint;
    await page.evaluate(() => Promise.all([loadAnnouncements(), loadDeadlines()]));
    assert.match(await page.locator('#topBanner').textContent(), /Enrollment is open <now>.*Oct 30, 2026/);
    assert.match(await page.locator('#deadlinesCard .deadline').textContent(), /Subject advising.*URGENT.*Oct 30, 2026/);
    await page.getByRole('button', { name: 'Dismiss announcement' }).click();
    await page.evaluate(() => loadAnnouncements());
    assert(await page.locator('#topBanner').isHidden(), 'Dismissal survives loading the same announcement again');
    await page.evaluate(async () => {
      localStorage.removeItem('myimcc_banner_dismissed_announcement');
      await loadAnnouncements();
    });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = document.body.dataset.theme = theme, theme);
      await page.evaluate(async () => {
        document.querySelectorAll('.page').forEach(element => element.classList.remove('active'));
        document.getElementById('page-dashboard').classList.add('active');
        corRecords.student_semesters.balance = 12450;
        await loadDashboard();
        const samples = { sidebarName: 'Alex Reyes', sidebarStudentNo: 'TEST-001', sidebarAvatar: 'AR', topAvatar: 'AR',
          topName: 'Alex', heroGreeting: 'Good morning, Alex!', heroSubtitle: 'Your academic journey, at a glance.',
          sidebarMeta: 'BSIT · 4th Year · 1st Semester',
          'stat-gwa': '1.75', 'stat-units': '21', 'stat-subjects': '7 subjects enrolled',
          'stat-balance': '₱12,450', 'stat-due': 'View your account details', 'stat-clearance': '3 / 4',
          sidebarFoot: 'Academic Year 2026–2027' };
        for (const [id, text] of Object.entries(samples)) document.getElementById(id).textContent = text;
      });
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 950 });
        for (const selector of ['.hero', '#page-dashboard .stat', '#page-dashboard .card', '#page-dashboard .quick-card', '.hero-actions .btn']) {
          for (const box of await page.locator(selector).all()) {
            const bounds = await box.boundingBox();
            assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `${root}${theme} ${width} ${selector} fits`);
          }
        }
        for (const selector of ['.hero h2', '.hero p', '.hero .meta', '.stat-label', '.stat-sub', '.quick-card .d']) {
          const pair = await colors(selector);
          assert(contrast(pair.foreground, pair.background) >= 4.5, `${root}${theme} ${selector}: needs 4.5:1 contrast`);
        }
        const gradient = await page.locator('.hero').evaluate(element => getComputedStyle(element).backgroundImage);
        const stops = gradient.match(/rgb\([^)]+\)/g);
        assert(stops?.length >= 2, 'Greeting keeps its colored gradient');
        for (const stop of stops) assert(contrast('rgb(255, 255, 255)', stop) >= 4.5, 'White greeting text is readable across the gradient');
        const enroll = page.locator('.hero-actions .btn-solid-w');
        for (const hovered of [false, true]) {
          if (hovered) await enroll.hover();
          const glass = await enroll.evaluate(element => {
            const style = getComputedStyle(element);
            return { background: style.backgroundColor, blur: style.backdropFilter, color: style.color };
          });
          const [r, g, b, alpha] = glass.background.match(/[\d.]+/g).map(Number);
          assert(alpha > 0 && alpha < 1 && glass.blur.includes('blur('), 'Enroll button keeps its translucent glass effect');
          assert.deepEqual([r, g, b], [255, 255, 255], 'Enroll button uses the reference white frost');
          for (const stop of stops) {
            const composite = stop.match(/[\d.]+/g).map(Number).map((channel, index) => channel * (1 - alpha) + [r, g, b][index] * alpha);
            glassContrast = Math.min(glassContrast, contrast(glass.color, `rgb(${composite.join(',')})`));
          }
        }
        await page.mouse.move(0, 0);
        assert(await page.locator('.stat-value').evaluateAll(elements => elements.every(element => element.scrollWidth <= element.clientWidth)), 'Stat values stay inside their cards');
        await enroll.focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        assert(await enroll.evaluate(element => element === document.activeElement && getComputedStyle(element).outlineStyle === 'solid'),
          `${root}${theme} ${width}: keyboard focus is visible`);
        if (root === '../' && [390, 1440].includes(width)) await page.screenshot({ path: fileURLToPath(new URL(`dashboard-${width}-${theme}.png`, output)), animations: 'disabled', fullPage: true });
      }
      await page.setViewportSize({ width: 1200, height: 950 });
      await page.evaluate(() => {
        const names = ['Cashier', 'Dean', 'Dean of Student Affairs (DSA)', 'Guidance', 'Laboratory/Nursing Arts/Cybershack', 'Library', 'Medical/Dental Clinic', 'Property Custodian', 'Registrar', 'ROTC/CWTS'];
        window.clearanceSample = names.map((department_name, index) => ({
          department_code: index === 0 ? 'cashier' : String(index), department_name, officer_name: 'Sample office contact',
          status: index === 0 ? 'action_required' : index === 1 ? 'cleared' : 'pending',
        }));
        document.querySelectorAll('.page').forEach(element => element.classList.remove('active'));
        document.getElementById('page-clearance').classList.add('active');
        document.getElementById('pageTitle').textContent = 'Online Clearance';
      });
      await page.evaluate(async () => {
        clearanceRead = { error: { message: 'Unavailable' } };
        await loadClearance();
      });
      assert(await page.getByRole('button', { name: 'Retry', exact: true }).isVisible());
      assert.equal(await page.locator('#clearFrac').textContent(), 'Unavailable');
      await page.evaluate(() => { clearanceRead = { data: [] }; });
      await page.locator('#retryClearance').press('Enter');
      assert.match(await page.locator('#deptGrid').textContent(), /No clearance records/);
      await page.evaluate(async () => {
        clearanceRead = { data: window.clearanceSample };
        await loadClearance();
      });
      assert.equal(await page.locator('#clearFrac').textContent(), '1/10 Cleared');
      assert.equal(await page.locator('#clearFill').evaluate(element => element.style.width), '10%');
      assert.equal(await page.locator('[data-goto="billing"], [data-page="billing"]').count(), 0);
      assert(await page.getByRole('button', { name: 'Billing & History Coming soon' }).isDisabled());
      await page.evaluate(() => goto('billing'));
      assert(await page.locator('#page-clearance').isVisible(), 'Billing navigation keeps the current page');
      assert(await page.locator('#page-billing').isHidden());
      await page.locator('[data-page="clearance"]').click();
      await page.waitForLoadState('networkidle');
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.equal(await page.locator('[data-office-icon]').count(), 10);
        for (const card of await page.locator('[data-clearance-office]').all()) {
          const bounds = await card.boundingBox();
          assert(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'Clearance cards fit');
          assert(await card.evaluate(element => element.scrollWidth <= element.clientWidth), 'Long office labels stay inside the card');
        }
        if (root === '../') await page.screenshot({ path: fileURLToPath(new URL(`clearance-${width}-${theme}.png`, output)), animations: 'disabled', fullPage: true });
      }
      await page.setViewportSize({ width: 1200, height: 950 });
      await page.evaluate(() => document.getElementById('chatPanel').showPopover());
      for (const selector of ['.msg-item-bot .msg-item-body', '.msg-item-bot .msg-item-head', '.msg-item.mine .msg-item-body', '#helpInput', '.help-chip', '.help-sources summary', '.help-sources li', '.cor-doc th']) {
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
        goto('cor');
      });
      await page.setViewportSize({ width: 390, height: 844 });
      assert(await page.locator('.cor-doc').evaluate(element => element.getBoundingClientRect().right <= innerWidth));
      assert(await page.getByRole('region', { name: 'Enrolled subjects and schedule' })
        .evaluate(element => element.scrollWidth > element.clientWidth), 'The subject table scrolls within the mobile document');
      for (const entry of ['button', 'keyboard']) {
        await page.setViewportSize({ width: 794, height: 1123 });
        await page.emulateMedia({ media: 'print' });
        await page.evaluate(entry => entry === 'button' ? document.getElementById('corPrintBtn').click()
          : window.dispatchEvent(new Event('beforeprint')), entry);
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
      if (process.env.COR_PRINT_QA && root === '../' && theme === 'dark') {
        await page.emulateMedia({ media: 'print' });
        await page.pdf({ path: fileURLToPath(new URL('cor-print-qa.pdf', output)), preferCSSPageSize: true, printBackground: true });
        await page.emulateMedia({ media: 'screen' });
      }
    }
    await page.close();
  }
  assert(glassContrast >= 4.5, `Enroll Now needs 4.5:1 contrast, measured ${glassContrast.toFixed(2)}:1`);
  console.log(`Enroll Now: minimum contrast ${glassContrast.toFixed(2)}:1.`);
  console.log('Student themes: dashboard layout at five widths, other text contrast, keyboard focus, assistant, COR print and review copy passed.');
} finally {
  await browser.close();
}
