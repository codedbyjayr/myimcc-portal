import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile,mkdir } from 'node:fs/promises';
import { server } from './test-portal.mjs';
process.env.TEST_PORTAL_UNTIL=new Date(Date.now()+3600000).toISOString();
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sdk=await readFile(new URL('../node_modules/@supabase/supabase-js/dist/umd/supabase.js',import.meta.url),'utf8');
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL || 'msedge'});
server.listen(0,'127.0.0.1');await once(server,'listening');
const origin='http://127.0.0.1:'+server.address().port;
const base={student_id:'demo-student',student_name:'Demo Student',student_no:'DEMO-001',program:'BSIT',year_level:'1st Year',section:'A',school_year:'2026-2027',semester:'1st Semester',enrolled_units:3,enrolled_courses:[]};
let empty=false,fail=false;
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('myimcc_theme','dark'));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'text/javascript',body:sdk});
  if(url.origin===origin && url.pathname==='/shared/supabase-config.js')return route.fulfill({contentType:'text/javascript',body:`
   const client=supabase.createClient('https://enrollment-ui.invalid','public-test',{auth:{persistSession:false,autoRefreshToken:false}});
   client.auth.getUser=async()=>({data:{user:{id:'dean',email:'dean@example.invalid'}}});
   client.auth.onAuthStateChange=()=>({data:{subscription:{unsubscribe(){}}}});
   window.supabaseClient=window.__myimcc_supabase_client__=client;window.getSupabaseClientAsync=async()=>client;`});
  if(url.hostname==='enrollment-ui.invalid'){
   if(url.pathname.endsWith('/profiles'))return route.fulfill({json:{id:'dean',role:'dean',status:'approved',is_active:true}});
   if(url.pathname.endsWith('/get_enrollment_workspace'))return route.fulfill({json:{groups:[],terms:[]}});
   if(fail)return route.fulfill({status:403,json:{message:'Temporary test failure'}});
   const status=route.request().postDataJSON()?.p_status || 'pending';
   return route.fulfill({json:empty?[]:[{...base,id:'request-1',code:'DEMO101',title:'Introduction to Computing',units:3,status:status==='all'?'approved':status,schedule:'Mon 09:00–10:30'}]});
  }
  return url.origin===origin?route.continue():route.abort();
 });
 await page.goto(origin+'/staff/enrollment-requests.html');
 await page.getByRole('heading',{name:'Demo Student DEMO-001'}).waitFor();
 assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 assert.equal(await page.locator('.heading-icon svg').count(),1);
 assert.equal(await page.locator('.status-pending').textContent(),'pending');
 await page.selectOption('#statusFilter','approved');
 await page.locator('.status-approved').waitFor();
 assert.equal(await page.locator('[data-decision]').count(),0,'Decision history must not expose new approval buttons');
 await mkdir('.temp/enrollment-ui',{recursive:true});
 await page.screenshot({path:'.temp/enrollment-ui/desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page must fit phone width');
 await page.screenshot({path:'.temp/enrollment-ui/mobile.png',fullPage:true});
 empty=true;await page.selectOption('#statusFilter','pending');
 await page.getByRole('heading',{name:'Nothing waiting for review'}).waitFor();
 await page.getByRole('button',{name:'View decision history'}).click();
 assert.equal(await page.locator('#statusFilter').inputValue(),'all');
 await page.getByRole('heading',{name:'No matching requests'}).waitFor();
 await page.screenshot({path:'.temp/enrollment-ui/empty.png',fullPage:true});
 fail=true;await page.getByRole('button',{name:'Refresh requests'}).click();
 await page.getByText('Could not load requests: Temporary test failure', {exact:false}).waitFor();
 assert.equal(await page.locator('.request-empty').count(),0,'Failure cannot look like an empty queue');
 fail=false;empty=false;await page.getByRole('button',{name:'Refresh requests'}).click();
 await page.locator('.status-approved').waitFor();
 fail=true;await page.getByRole('button',{name:'Refresh requests'}).click();
 await page.getByText('displayed results may be outdated.',{exact:false}).waitFor();
 assert.equal(await page.locator('.student-request').count(),1,'Failed refresh preserves existing student cards');
 fail=false;
 await page.evaluate(()=>document.documentElement.dataset.theme='light');
  await page.waitForFunction(()=>getComputedStyle(document.body).backgroundColor==='rgb(247, 245, 250)');
 assert.deepEqual(errors,[]);
 console.log('Enrollment UI: populated/empty/error states, status badges, history action, dark/light themes and phone layout passed.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
