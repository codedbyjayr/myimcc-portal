import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'});
try {
 const page=await browser.newPage({viewport:{width:1200,height:850}});
 await page.setContent(`<html data-theme="dark"><body><div id="modalOverlay" class="modal-overlay open course-offering-modal"><div class="modal-box"><h3 id="modalTitle">Add course offering</h3><form id="modalForm"><div class="form-row"><label>Search</label><input class="field-input" id="field_catalog_search"></div><div class="form-row"><select id="field_catalog_course"><option value=""></option><option value="CAP102">CAP102</option></select></div>${['code','title','units','program','year','semester','school_year','schedule'].map(x=>'<div class="form-row"><label>'+x+'</label><input class="field-input" id="field_'+x+'"></div>').join('')}<div class="form-row" id="instructorSelectWrapper">Instructor pending</div></form><div class="modal-actions"><button class="btn btn-outline">Cancel</button><button class="btn btn-primary">Add course offering</button></div></div></div></body></html>`);
 await page.addStyleTag({path:'faculty/sharedstyle.css'});await page.addStyleTag({path:'faculty/subject-picker.css'});await page.addScriptTag({path:'shared/subject-picker.js'});
 await page.evaluate(()=>{
  const select=document.getElementById('field_catalog_course');
  const insights=window.imccSubjectPicker(select,document.getElementById('field_catalog_search'),[{code:'CAP102',title:'Capstone Project and Research 2 — a full curriculum subject title',units:3,program:'BSIT',year_level:4,semester:2}],document.getElementById('modalForm'));
  select.addEventListener('change',()=>{document.getElementById('field_code').value=select.value;insights.textContent='CAP102 — Capstone Project and Research 2 · 3 units · Prerequisites: CAP101';});
 });
 await page.locator('#field_catalog_search').fill('capstone');assert.equal(await page.locator('.subject-result').count(),1);
 await page.locator('#field_catalog_search').press('ArrowDown');assert(await page.locator('.subject-result').evaluate(e=>e===document.activeElement));await page.keyboard.press('Enter');
 assert(await page.locator('.selected-subject').isVisible());assert(await page.locator('.subject-results').isHidden());assert.equal(await page.locator('#field_code').inputValue(),'CAP102');
 await page.getByRole('button',{name:'Change subject'}).click();await page.locator('#field_catalog_search').fill('xyz');assert(await page.getByText('No subjects found. Clear or change your search.').isVisible());
 await page.locator('#field_catalog_search').fill('');assert.equal(await page.locator('.subject-result').count(),1);
 await mkdir('.temp/subject-picker',{recursive:true});await page.screenshot({path:'.temp/subject-picker/desktop.png'});
 await page.setViewportSize({width:390,height:740});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(await page.getByRole('button',{name:'Add course offering'}).isVisible());await page.screenshot({path:'.temp/subject-picker/mobile.png'});
 console.log('Subject picker: search, empty/clear, keyboard selection, autofill event, change action and mobile bounds passed.');
} finally {await browser.close();}
