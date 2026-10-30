import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFile,mkdir} from 'node:fs/promises';
import {server} from './test-portal.mjs';
process.env.TEST_PORTAL_UNTIL=new Date(Date.now()+3600000).toISOString();
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const html=await readFile(new URL('../student/dashboard.html',import.meta.url),'utf8');
const source=await readFile(new URL('../student/dashboard.js',import.meta.url),'utf8');
const fragment=html.slice(html.indexOf('<!-- FAQ Chatbot FAB'),html.indexOf('<!-- MFA Modal'));
const helpers=source.slice(source.indexOf('const FAQ_FUNCTION ='),source.indexOf('// ── Booking'));
const wiring=source.slice(source.indexOf('function wireHelp()'),source.indexOf('/**',source.indexOf('function wireHelp()')));
const toggle=source.slice(source.indexOf('function toggleChat(force)'),source.indexOf('// ── MFA Configuration Module'));
const answer='Open **Grades & Evaluation** to review the grades recorded for a selected term.\n\n1. Choose the **Semester** you want to check.\n2. Use **Year level** to narrow the list if needed.\n3. Read Pre-lim, Midterm, Semi-finals, Finals, Equivalent and Remark. **Grade Estimate** is an estimate, not an official result.\n4. Choose **View Degree Prospectus** for your curriculum and recorded completion.\n\nIf a grade is missing, check the selected term first. Book a consultation if staff need to review the record.';
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});
server.listen(0,'127.0.0.1');await once(server,'listening');
const origin=`http://127.0.0.1:${server.address().port}`;
await mkdir(new URL('../.temp/faq-chat/',import.meta.url),{recursive:true});
try {
 for(const [name,width,height] of [['desktop',1366,900],['mobile',390,844]]) {
  const page=await browser.newPage({viewport:{width,height}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setContent(`<head><link rel="stylesheet" href="${origin}/student/dashboard.css"><link rel="stylesheet" href="${origin}/shared/rwd.css"></head><body>${fragment}</body>`);
  await page.addScriptTag({content:await readFile(new URL('../shared/ui.js',import.meta.url),'utf8')});
  await page.addScriptTag({content:`const getEl=id=>document.getElementById(id),escapeHtml=UIM.escapeHtml;
    window.testReply={data:{answer:${JSON.stringify(answer)},sources:[{id:'grades',question:'How do I check my grades?'}],resolved:true}};
    const supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'fictional'}}})},functions:{invoke:async()=>window.testReply}};
    window.bookings=0;function revealBooking(){window.bookings++;}
    ${helpers}\n${wiring}\n${toggle}\nwireHelp();`});
  await page.locator('#chatFab').click();
  await page.getByRole('button',{name:'How do I check my grades?',exact:true}).click();
  await page.locator('.help-sources').waitFor();
  assert.equal(await page.locator('#helpSuggestions').getAttribute('open'),null);
  assert.equal(await page.locator('#helpInput').inputValue(),'','Chip must not leave a duplicate question in the input');
  assert.equal(await page.evaluate(()=>window.bookings),0);
  assert.equal(await page.locator('#chatPanel').evaluate(el=>el.matches(':popover-open')),true);
  assert((await page.locator('#helpLog').boundingBox()).height>250,'The answer needs usable reading space');
  assert(await page.locator('#chatPanel').evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
  await page.screenshot({path:new URL(`../.temp/faq-chat/${name}.png`,import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
  await page.evaluate(()=>{window.testReply={data:{answer:'A staff member needs to review this question.',resolved:false,sources:[]}};});
  await page.locator('#helpInput').fill('Please help with an unavailable record');
  await page.locator('#helpSend').click();
  await page.locator('[data-help-book]').waitFor();
  assert.equal(await page.evaluate(()=>window.bookings),0,'Unanswered replies must stay in chat');
  await page.locator('[data-help-book]').click();
  assert.equal(await page.evaluate(()=>window.bookings),1);
  assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('FAQ chat: desktop/mobile reading area, collapsed suggestions, compact sources and optional booking passed.');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
