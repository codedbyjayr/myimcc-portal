// Verification test for Student Dashboard markup and styling integrity.
// Run: node student/dashboard.test.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./dashboard.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('./dashboard.css', import.meta.url), 'utf8');

// 1. Brand Mark Emblem
assert(!html.includes('<div class="brand-mark">MI</div>'), 'Crude MI text placeholder must be eliminated');
assert(html.includes('class="brand-mark-svg"'), 'Vector brand mark SVG must be present in dashboard.html');
assert(html.includes('M9.5 27.5V14L19.5 21.5'), 'Caduceus Open-Book vector path must be in brand mark');
assert(css.includes('.brand-mark-svg'), 'CSS must define .brand-mark-svg');

// 2. Critical interactive IDs preserved
const expectedIds = [
  'sidebar',
  'sidebarOverlay',
  'sidebarCloseBtn',
  'menuToggle',
  'pageTitle',
  'heroGreeting',
  'heroSubtitle',
  'stat-gwa',
  'stat-units',
  'stat-balance',
  'stat-clearance',
  'themeToggle',
  'topBanner'
];

for (const id of expectedIds) {
  assert(html.includes(`id="${id}"`), `Expected ID #${id} must remain intact in dashboard.html`);
}

// 3. Collegiate Styling Integrity
assert(css.includes('linear-gradient(135deg, #7A132C'), 'Collegiate wine gradient must be defined on .hero');
assert(css.includes('backdrop-filter: blur(12px)'), 'Frosted glass blur must be defined on .topbar');
assert(css.includes("font-family: 'JetBrains Mono', monospace;"), 'JetBrains Mono must be used on .stat-value');
assert(css.includes('.stat.c2 .stat-icon') && css.includes('.stat.c4 .stat-icon'), 'Semantic accent icons must be defined for stats');

// 4. Dark Mode Token Calibration & Persistence Integrity
assert(html.includes("localStorage.getItem('myimcc_theme')"), 'Anti-FOUC script with localStorage theme lookup must be present in <head>');
assert(css.includes('[data-theme="dark"] .hero'), 'Dark mode specific velvet hero gradient override must be present in CSS');
assert(css.includes('--green: #34D399;'), 'Luminous emerald semantic green must be defined for dark mode');
assert(css.includes('--amber: #FBBF24;'), 'Luminous amber semantic token must be defined for dark mode');
assert(css.includes('[data-theme="dark"] .nav-item.active'), 'High contrast active nav item must be defined for dark mode');

console.log('student/dashboard: all verification checks passed.');
