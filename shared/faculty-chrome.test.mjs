import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

for (const prefix of ['', 'review-assets/']) {
  const list = {};
  const context = vm.createContext({document:{getElementById:id=>id==='enrollmentNotifications'?list:null}});
  vm.runInContext(readFileSync(prefix+'shared/identity.js','utf8'),context);
  vm.runInContext(readFileSync(prefix+'shared/faculty-chrome.js','utf8'),context);
  const escape = context.FC.escapeHtml;
  assert.equal(escape('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(escape("' autofocus onfocus='alert(1)"), '&#39; autofocus onfocus=&#39;alert(1)');
  assert.equal(escape('&lt;script&gt;'), '&amp;lt;script&amp;gt;');
  for (const [input, expected] of [[null,''],[undefined,''],[0,'0'],[false,'false'],['José & Ana', 'José &amp; Ana']]) assert.equal(escape(input),expected);
  const client = {from:()=>({select(){return this;},order(){return this;},limit:async()=>({data:[{id:'" autofocus onfocus="alert(1)',subject:'<img src=x onerror="alert(1)">',body:'José & Ana'}]})})};
  await context.FC.loadEnrollmentNotifications(client);
  assert(!list.innerHTML.includes('<img'));
  assert(list.innerHTML.includes('&lt;img'));
  assert(list.innerHTML.includes('José &amp; Ana'));
  assert(list.innerHTML.includes('data-read="&quot; autofocus onfocus=&quot;alert(1)"'));
}
console.log('Faculty escaping: normal/demo script order, markup, quotes, entities and ordinary values passed.');
