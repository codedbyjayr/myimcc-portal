// Verification test for Registrar Dashboard markup and dark mode styling integrity.
// Run: node staff/registrar-dashboard.test.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./registrar-dashboard.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('./registrar-dashboard.css', import.meta.url), 'utf8');

// 1. Anti-FOUC and Theme toggle presence
assert(html.includes("localStorage.getItem('myimcc_theme')"), 'Anti-FOUC script must be present in <head>');
assert(html.includes('id="themeToggle"'), '#themeToggle must be present in registrar-dashboard.html');
assert(html.includes('id="themeIcon"'), '#themeIcon must be present in registrar-dashboard.html');
assert(html.includes('id="themeLabel"'), '#themeLabel must be present in registrar-dashboard.html');

// 2. Dark mode tokens & components in CSS
assert(css.includes('[data-theme="dark"]'), '[data-theme="dark"] block must be defined in registrar-dashboard.css');
assert(css.includes('[data-theme="dark"] .hero'), 'Dark mode specific velvet hero gradient override must be present');
assert(css.includes('.theme-toggle'), '.theme-toggle class must be styled in CSS');
assert(css.includes('--white: #1C1623;'), 'Dark mode must map --white to dark surface token');

console.log('staff/registrar-dashboard: all verification checks passed.');

for (const prefix of ['', 'review-assets/']) {
 const markup=readFileSync(prefix+'staff/registrar-dashboard.html','utf8');
 const styles=readFileSync(prefix+'staff/registrar-dashboard.css','utf8');
 assert(styles.includes('color-scheme: only light;'));
 assert(styles.includes('--bg: #ffffff;'));
 const enrollment=markup.match(/<a class="nav-item" href="enrollment-requests.html">[\s\S]*?<\/a>/)[0];
 assert(enrollment.includes('<svg') && enrollment.includes('Enrollment</a>'));
 for(const label of ['Appointments','Messages']) {
  const button=[...markup.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(m=>m[0]).find(b=>b.includes('                    '+label));
  assert(button && button.includes('disabled') && button.includes('Coming soon'));
  assert(!button.includes('data-view='));
 }
}
