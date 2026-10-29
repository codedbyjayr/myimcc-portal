import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { server } from './test-portal.mjs';
process.env.TEST_PORTAL_UNTIL = new Date(Date.now() + 3600000).toISOString();
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sdk = await readFile(new URL('../node_modules/@supabase/supabase-js/dist/umd/supabase.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir(new URL('../.temp/adviser-layout/', import.meta.url), { recursive: true });
let role = 'registrar';
const writes = [], errors = [], notices = [];
const termStates = new Map(['1st Semester','2nd Semester','Summer'].map(s=>[s,false]));
const students = Array.from({ length: 40 }, (_, i) => ({ id: `student-${i}`, student_no: `TEST-${i}`, full_name: `Student ${i}`, role: 'student', status: 'approved', program: 'BSIT', year_level: '1st Year' }));
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(10000);
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.hostname === 'cdn.jsdelivr.net') return route.fulfill({ contentType: 'text/javascript', body: sdk });
  if (url.origin === origin && url.pathname === '/shared/supabase-config.js') return route.fulfill({ contentType: 'text/javascript', body: `
    const client = supabase.createClient('https://adviser-test.invalid', 'test-key', { auth: { persistSession: false, autoRefreshToken: false } });
    client.auth.getUser = async () => ({ data: { user: { id: '${role}', email: '${role}@example.invalid' } } });
    client.auth.getSession = async () => ({ data: { session: null } });
    client.auth.onAuthStateChange = () => ({ data: { subscription: { unsubscribe() {} } } });
    client.channel = () => ({ on() { return this; }, subscribe() { return this; } });
    window.supabaseClient = window.__myimcc_supabase_client__ = client;
    window.getSupabaseClientAsync = async () => client;` });
  if (url.hostname === 'adviser-test.invalid') {
    const table = url.pathname.split('/').pop();
    const object = request.headers().accept?.includes('object+json');
    let data = [];
    if (table === 'set_enrollment_term') {
      const payload=request.postDataJSON();writes.push({table,payload});
      if(payload.p_open && !termStates.get(payload.p_semester)) notices.push({id:String(notices.length+1),student_id:'student',description:`Enrollment is now open for ${payload.p_semester}, ${payload.p_school_year}.`,created_at:new Date().toISOString()});
      termStates.set(payload.p_semester,payload.p_open);
    }
    if (table === 'get_enrollment_workspace') data={groups:[],terms:[...termStates].map(([semester,is_open])=>({school_year:'2026-2027',semester,is_open}))};
    if (table === 'profiles') {const profile={id:role,full_name:role+' Tester',email:role+'@example.invalid',role,status:'approved',is_active:true,program:'BSIT',year_level:'1st Year'};data=object?profile:students;}
    if (table === 'activities') data=notices;
    if (table === 'enrollment_terms') data=[...termStates].filter(([,open])=>open).map(([semester])=>({school_year:'2026-2027',semester}));
    if (table === 'student_semesters') data=object?{school_year:'2026-2027',semester:'Summer'}:[];
    return route.fulfill({ json: data });
  }
  return url.origin === origin ? route.continue() : route.abort();
});
try {
  role='registrar';
  await page.addInitScript(()=>localStorage.setItem('myimcc_theme','light'));
  await page.goto(origin+'/staff/registrar-dashboard.html');
  await page.waitForFunction(()=>document.getElementById('welcomeName').textContent==='registrar Tester');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(255, 255, 255)');
  const enrollment=page.locator('a[href="enrollment-requests.html"]');
  assert.equal((await enrollment.textContent()).trim(),'Enrollment');
  assert.equal(await enrollment.locator('svg').count(),1);
  assert.equal(await enrollment.evaluate(el=>getComputedStyle(el).textDecorationLine),'none');
  for(const label of ['Appointments','Messages']) assert(await page.locator('.sidebar button').filter({hasText:label}).isDisabled());
  await page.screenshot({path:'.temp/adviser-layout/registrar-white.png'});
  await page.locator('#themeToggle').click();
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  assert.notEqual(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(255, 255, 255)');
  await page.locator('#themeToggle').click();
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(255, 255, 255)');
  await page.setViewportSize({width:390,height:844});
  await page.locator('#menuToggle').click();
  await page.waitForTimeout(400);
  await page.screenshot({path:'.temp/adviser-layout/registrar-sidebar-mobile.png'});
  await enrollment.click();
  await page.locator('#enrollmentTermSelect option').first().waitFor({state:'attached'});
  await page.locator('#termManager summary').click();
  assert.equal(await page.locator('#enrollmentTermSelect option').count(),3,'All terms exist without any subjects');
  for(const semester of ['1st Semester','2nd Semester','Summer']) {
    await page.selectOption('#enrollmentTermSelect',JSON.stringify(['2026-2027',semester]));
    await page.locator('#openTerm').click();
    await page.waitForFunction(term=>document.getElementById('termStatus').textContent===`Enrollment opened for ${term}, 2026-2027.`,semester);
  }
  assert.equal(notices.length,3);
  await page.screenshot({path:'.temp/adviser-layout/registrar-empty-terms.png'});
  role='student';await page.goto(origin+'/student/dashboard.html');
  await page.locator('#enrollmentTerm option').first().waitFor({state:'attached'});
  await page.locator('#menuToggle').click();
  await page.locator('[data-page="enrollment"]').click();
  assert.equal(await page.locator('#enrollmentTerm option').count(),3,'Student sees open empty terms');
  assert(await page.locator('#proceedBtn').isDisabled(),'Cannot enroll without subjects');
  assert.deepEqual(errors,[]);
  console.log('Registrar browser: white/dark themes, Enrollment icon, Coming soon items, empty term opening and student term visibility passed.');
} finally {await browser.close(); await new Promise(resolve=>server.close(resolve));}
