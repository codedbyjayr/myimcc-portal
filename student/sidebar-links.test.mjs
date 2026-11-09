import { dashboardMarkup, loadDashboardView } from '../scripts/dashboard-markup.mjs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const { StudentQuickLinks } = await loadDashboardView(new URL('./dashboard-view.tsx', import.meta.url));
const renderStudentQuickLinks = props => renderToStaticMarkup(createElement(StudentQuickLinks, props));
assert.match(renderStudentQuickLinks({ links: [{ label: 'Unsafe', url: 'javascript:alert(1)' }] }), /^<div[^>]*>Links coming soon<\/div>$/);

for (const prefix of ['', 'review-assets/']) {
  const html = (await dashboardMarkup(new URL('../' + prefix + 'student/dashboard.html', import.meta.url))).replace(/\r/g, '');
  const sidebar = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
  for (const label of ['Attendance', 'Faculty Evaluation', 'Help', 'Messages', 'Billing &amp; History']) {
    const button = [...sidebar.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(m => m[0]).find(b => b.includes('\n        ' + label + '\n'));
    assert(button, label + ' remains visible');
    assert.match(button, /\bdisabled\b/);
    assert.match(button, /<span class="soon-badge">Coming soon<\/span>/);
    assert(!button.includes('data-page='), label + ' cannot navigate');
  }
  assert(sidebar.includes('data-page="profile"'));
  assert(!/data-(page|goto)="billing"/.test(html), 'Billing has no live navigation entry');
  assert(!sidebar.includes('data-page="help"'));

  const links = ['LMS', 'Career Hub', ' Email ', 'EMAIL', 'Library'].map(label => ({label, roles:'student, teacher, dean', url:'https://example.invalid'}));
  links.push({label:'Other role only',roles:'admin',url:'https://example.invalid'});
  const client = {from: () => ({select(){return this;},eq(){return this;},order:async()=>({data:links})})};
  for (const role of ['student', 'teacher', 'dean']) {
    const nav = {};
    const context = vm.createContext({document:{getElementById:()=>nav},getEl:()=>nav, state:{studentProfile:{role}},supabaseClient:client,escapeHtml:String});
    if (role === 'student') {
      context.window = { renderStudentQuickLinks };
      const source = readFileSync(prefix + 'student/dashboard.js', 'utf8');
      vm.runInContext(source.slice(source.indexOf('async function loadSSOLinks()'),source.indexOf('// ── Attendance Module')),context);
      await context.loadSSOLinks();
    } else {
      vm.runInContext(readFileSync(prefix + 'shared/faculty-chrome.js','utf8'),context);
      await context.FC.loadSSOLinks(client,role);
    }
    assert(nav.innerHTML.includes('LMS') && nav.innerHTML.includes('Career Hub'));
    assert(!/email|library|Other role only/i.test(nav.innerHTML),role + ' hides Email and preserves role filtering');
  }
}
console.log('Sidebar: Coming Soon items including Billing are disabled, Profile is active, and Email is hidden in normal and demo pages.');
