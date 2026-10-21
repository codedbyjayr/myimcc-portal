import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { server } from './test-portal.mjs';
process.env.TEST_PORTAL_UNTIL = new Date(Date.now() + 3600000).toISOString();

// Use the existing browser tooling and actual Supabase SDK; no app dependency is added.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sdk = await readFile(new URL('../node_modules/@supabase/supabase-js/dist/umd/supabase.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const user = { id: 'developer-id', email: 'jlm33405@imcc.edu.ph' };
const profile = { ...user, full_name: 'Developer Tester', role: 'admin', status: 'approved', is_active: true, program: 'BSN', year_level: '1', section: 'A' };
const paths = {
  student: '/student/dashboard.html', faculty: '/faculty/teacher-dashboard.html', dean: '/faculty/dean-dashboard.html',
  registrar: '/staff/registrar-dashboard.html', staff: '/staff/staff-dashboard.html', admin: '/admin/admin-dashboard.html',
};
const offering = { id: 42, code: 'PILOT101', title: 'Pilot course', units: 3, fee: 1000, program: 'BSN', year_level: '1',
  section: 'A', instructor_id: user.id, instructor_name: profile.full_name, school_year: '2026-2027', semester: '1st Semester' };
function rowsFor(url) {
  const table = url.pathname.split('/').pop();
  if (table === 'profiles') return url.searchParams.get('status') === 'eq.pending' ? [] : [profile];
  if (table === 'course_offerings') return [offering];
  if (table === 'clearances') return [{ id: 1, student_id: user.id, department_code: 'LIB', department_name: 'Library', status: 'pending', profiles: profile }];
  if (table === 'student_semesters') return [{ student_id: user.id, semester: offering.semester, school_year: offering.school_year, units_enrolled: 3 }];
  return [];
}
function dataResponse(url, headers = {}) {
  const rows = rowsFor(url);
  return { status: 200, contentType: 'application/json', headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` },
    body: JSON.stringify(headers.accept?.includes('object+json') ? rows[0] || null : rows) };
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], reads = [], writes = [];
  let denyAccess = false;
  let demoRole = null;
  const demoWrites = [];
  page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.message); });
  page.on('console', message => { if (message.type() === 'error' && message.text().includes('Executing inline script')) console.error(message.text()); });
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.hostname === 'cdn.jsdelivr.net') return route.fulfill({ contentType: 'text/javascript', body: sdk });
    if (url.origin === origin && url.pathname === '/shared/supabase-config.js' && request.frame() === page.mainFrame()) {
      return route.fulfill({ contentType: 'text/javascript', body: `
        const client = supabase.createClient('https://preview-db.invalid', 'test-key', { auth: { persistSession: false, autoRefreshToken: false } });
        client.auth.getUser = async () => ({ data: { user: ${JSON.stringify(user)} } });
        client.auth.getSession = async () => ({ data: { session: { access_token: 'private-parent-token' } } });
        client.auth.onAuthStateChange = callback => { window.testAuthChange = callback; return { data: { subscription: { unsubscribe() {} } } }; };
        window.supabaseClient = window.__myimcc_supabase_client__ = client;
        window.getSupabaseClientAsync = async () => client;` });
    }
    if (url.hostname === 'preview-db.invalid') {
      if (request.method() !== 'GET') writes.push(request.url());
      return route.fulfill(dataResponse(url, request.headers()));
    }
    if (url.pathname.endsWith('/developer-demo')) {
      assert.equal(request.headers().authorization,'Bearer private-parent-token');
      if (request.method()==='GET') return route.fulfill({json:{available:true,roles:Object.keys(paths)}});
      const input=request.postDataJSON();
      if(input.action==='start') {
        demoRole=input.role;
        return route.fulfill({json:{role:demoRole,user:{id:'demo-user',email:'review.'+demoRole+'@example.invalid'},path:paths[demoRole],expiresAt:Date.now()+1800000,ticket:'opaque-demo-ticket'}});
      }
      assert.equal(input.ticket,'opaque-demo-ticket');
      if(!['GET','HEAD'].includes(input.method)) demoWrites.push(input);
      const target=new URL(input.resource,origin);
      if(target.pathname==='/rest/v1/rpc/list_enrollment_request_history') return route.fulfill({json:[{id:'demo-request',student_id:'demo-student',student_name:'Demo Student',school_year:'2026-2027',semester:'Summer',program:'BSIT',year_level:'1st Year',code:'DEMO-SUM',title:'Demo Summer',units:3,status:'pending'}]});
      if(target.pathname==='/rest/v1/rpc/get_enrollment_workspace') return route.fulfill({json:{groups:[{student_id:'demo-student',student_name:'Demo Student',school_year:'2026-2027',semester:'Summer',units:3}],terms:[]}});
      if(target.pathname==='/rest/v1/profiles') {
        const row={...profile,id:'demo-user',email:'review.'+demoRole+'@example.invalid',full_name:'DEMO '+demoRole,role:demoRole};
        return route.fulfill({json:input.accept?.includes('object+json') ? row : [row]});
      }
      return route.fulfill(dataResponse(target,{accept:input.accept}));
    }
    if(url.origin===origin && url.pathname.startsWith('/review-assets/')) {
      const path=url.pathname.replace('/review-assets','');
      try { return route.fulfill({body:await readFile(new URL('..'+path,import.meta.url)),contentType:path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':'text/javascript'}); }
      catch { return route.fulfill({status:404,body:''}); }
    }
    if (url.origin === origin && url.pathname === '/api/developer-preview') {
      assert.equal(request.headers().authorization, 'Bearer private-parent-token');
      assert.equal(request.method(), 'GET');
      if (denyAccess) return route.fulfill({ status: 403, json: { error: 'Preview access denied.' } });
      const resource = url.searchParams.get('resource');
      if (!resource) return route.fulfill({ json: { dashboards: paths, user } });
      reads.push(resource);
      const target = new URL(resource, origin);
      if (target.pathname.startsWith('/rest/v1/rpc/') && !['get_class_roster', 'get_subject_instructor_options', 'get_dean_student_directory', 'list_student_records', 'get_student_record', 'helpdesk_recipient_id','list_enrollment_request_history','get_enrollment_workspace'].includes(target.pathname.split('/').pop())) {
        return route.fulfill({ status: 400, json: { message: 'Only dashboard data reads are allowed.' } });
      }
      return route.fulfill(dataResponse(target, { accept: request.headers()['x-preview-accept'] }));
    }
    return url.origin === origin ? route.continue() : route.abort();
  });
  await page.addInitScript(() => { if (window === top) localStorage.setItem('myimcc_theme', 'dark'); });
  await page.goto(origin + '/admin/admin-dashboard.html');
  await page.locator('#developerPreviewControl').waitFor({ state: 'visible' });
  assert(await page.locator('#temporaryRoleTest').isVisible());
  assert(await page.locator('#adminWorkspace').isVisible());
  for (const role of Object.keys(paths).filter(role => role !== 'admin')) {
    const before = reads.length;
    await page.selectOption('#previewRole', role);
    assert.equal(await page.locator('#temporaryRoleTest').textContent(), 'Try selected role (demo)');
    await page.locator('#previewFrame').waitFor({ state: 'visible' });
    await page.getByText(`Viewing as ${role[0].toUpperCase() + role.slice(1)} — read only`, { exact: true }).waitFor();
    const frame = await (await page.locator('#previewFrame').elementHandle()).contentFrame();
    await frame.waitForFunction(expected => document.baseURI === expected, origin + paths[role]);
    await frame.waitForLoadState('load');
    await frame.waitForFunction(() => !!window.__myimcc_supabase_client__);
    const probe = await frame.evaluate(() => window.__myimcc_supabase_client__.from('profiles').select('*').eq('id', 'developer-id').single());
    assert(probe.data, `${role}: ${JSON.stringify(probe)}; requests: ${reads.slice(-3).join(', ')}`);
    await frame.getByText('Developer Tester', { exact: true }).first().waitFor({ state: 'visible' });
    assert(reads.length > before, `${role}: original scripts must request real data`);
    assert(await page.locator('#adminWorkspace').isHidden());
    assert.equal(await frame.locator('html').getAttribute('data-theme'), 'dark');
    assert(!await page.locator('#previewFrame').getAttribute('srcdoc').then(source => source.includes('private-parent-token')));
    assert.equal(await frame.evaluate(() => window.__myimcc_supabase_client__.auth.getSession().then(result => result.data.session.access_token)), 'read-only');
    const denied = await frame.evaluate(async () => {
      let parentBlocked = false, networkBlocked = false;
      try { void parent.document; } catch { parentBlocked = true; }
      try { await fetch('/api/should-never-run', { method: 'POST' }); } catch { networkBlocked = true; }
      const { error } = await window.__myimcc_supabase_client__.from('profiles').update({ role: 'student' }).eq('id', 'developer-id');
      return { parentBlocked, networkBlocked, message: error.message, token: localStorage.getItem('myimcc-auth-token') };
    });
    assert.deepEqual(denied, { parentBlocked: true, networkBlocked: true, message: 'Developer view is read only.', token: null });
    const nav = frame.locator('[data-page="profile"],[data-view="prospectus"]');
    if (await nav.count()) {
      await nav.first().click();
      await frame.locator('#page-profile,#view-prospectus').waitFor({ state: 'visible' });
    }
    if (role === 'faculty') {
      await frame.locator('[data-page="classes"]').click();
      await frame.getByText('PILOT101', { exact: true }).first().waitFor();
    }
    if (role === 'dean') {
      assert.equal(await frame.locator('[data-page="financial"]').count(),0);
      await frame.locator('a[href*="enrollment-requests"]').click();
      await page.waitForFunction(()=>document.getElementById('previewFrame').srcdoc.includes('/staff/enrollment-requests.html'));
      const enrollment=await (await page.locator('#previewFrame').elementHandle()).contentFrame();
      await enrollment.getByText('No pending requests found.',{exact:true}).waitFor();
      await enrollment.locator('#back').click();
      await page.waitForFunction(()=>document.getElementById('previewFrame').srcdoc.includes('/faculty/dean-dashboard.html'));
    }
    await page.selectOption('#previewRole', 'admin');
    assert(await page.locator('#adminWorkspace').isVisible());
    assert(await page.locator('#developerPreview').isHidden());
    assert.equal(await page.locator('#previewFrame').getAttribute('srcdoc'), null);
    console.log(`${role}: original scripts, permitted data, saved theme, navigation and blocked writes passed.`);
  }
  await page.selectOption('#previewRole', 'staff');
  await page.getByText('Viewing as Staff — read only', { exact: true }).waitFor();
  const staff = await (await page.locator('#previewFrame').elementHandle()).contentFrame();
  await staff.getByText('Developer Tester', { exact: true }).first().waitFor();
  if (process.env.PREVIEW_SCREENSHOT) await page.screenshot({ path: process.env.PREVIEW_SCREENSHOT });
  await page.locator('#exitPreview').click();
  assert(await page.locator('#adminWorkspace').isVisible());
  denyAccess = true;
  await page.selectOption('#previewRole', 'student');
  await page.getByText('Preview access denied.', { exact: true }).waitFor();
  assert(await page.locator('#previewFrame').isHidden());
  assert(await page.locator('#adminWorkspace').isVisible());
  denyAccess = false;
  await page.selectOption('#previewRole','dean');
  await page.getByText('Viewing as Dean — read only',{exact:true}).waitFor();
  await page.locator('#temporaryRoleTest').click();
  await page.getByText('DEMO ONLY · Dean · review.dean@example.invalid',{exact:true}).waitFor();
  let demoFrame=await (await page.locator('#previewFrame').elementHandle()).contentFrame();
  await demoFrame.getByText('DEMO dean',{exact:true}).first().waitFor();
  const demoWrite=await demoFrame.evaluate(()=>window.supabaseClient.from('faculty_notes').insert({content:'Fictional note',faculty_name:'DEMO'}));
  assert.equal(demoWrite.error,null);
  assert(demoWrites.some(request=>request.resource.startsWith('/rest/v1/faculty_notes')));
  assert(!await page.locator('#previewFrame').getAttribute('srcdoc').then(source=>source.includes('opaque-demo-ticket')||source.includes('private-parent-token')));
  await demoFrame.locator('a[href*="enrollment-requests"]').click();
  await page.waitForFunction(()=>document.getElementById('previewFrame').srcdoc.includes('/review-assets/staff/enrollment-requests.html'));
  demoFrame=await (await page.locator('#previewFrame').elementHandle()).contentFrame();
  await demoFrame.getByRole('button',{name:'Approve',exact:true}).click();
  await demoFrame.getByRole('button',{name:'Reject',exact:true}).click();
  await demoFrame.locator('dialog textarea').fill('Demo prerequisite missing');
  await demoFrame.locator('dialog').getByRole('button',{name:'Continue',exact:true}).click();
  await demoFrame.getByRole('button',{name:'Finalize Enrollment',exact:true}).click();
  await demoFrame.locator('dialog').getByRole('button',{name:'Continue',exact:true}).click();
  await demoFrame.locator('dialog').waitFor({state:'detached'});
  await demoFrame.waitForFunction(()=>!document.getElementById('refresh').disabled);
  assert(demoWrites.some(r=>r.body?.p_decision==='approved'));
  assert(demoWrites.some(r=>r.body?.p_decision==='rejected' && r.body?.p_review_note==='Demo prerequisite missing'));
  assert(demoWrites.some(r=>r.resource.includes('/rpc/finalize_enrollment')));
  await page.locator('#temporaryRoleTest').click();
  await page.getByText('Viewing as Dean — read only',{exact:true}).waitFor();
  assert.equal(await page.locator('#temporaryRoleTest').textContent(),'Try selected role (demo)');
  console.log('Interactive demo identity, brokered writes, enrollment navigation and return to read-only passed.');
  await page.selectOption('#previewRole', 'staff');
  await page.getByText('Viewing as Staff — read only', { exact: true }).waitFor();
  await page.evaluate(() => window.testAuthChange('SIGNED_OUT'));
  assert(await page.locator('#developerPreviewControl').isHidden());
  assert(await page.locator('#temporaryRoleTest').isHidden());
  assert.equal(await page.locator('#previewFrame').getAttribute('srcdoc'), null);
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  for (const path of ['/admin/role-preview.html', '/admin/role-preview.js', '/admin/role-preview.css', '/admin/role-preview-navigation.js']) {
    assert.equal((await page.request.get(origin + path)).status(), 404, 'Retired viewer files must be gone');
  }
  console.log('Main admin restoration, exit, denied access, session cleanup and removed-file checks passed.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
