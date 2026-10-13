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
assert(css.includes('--topbar-bg'), '--topbar-bg variable must be configured for light and dark modes');
assert(css.includes("font-family: 'JetBrains Mono', monospace;"), 'JetBrains Mono must be used on .stat-value');
assert(css.includes('.stat.c2 .stat-icon') && css.includes('.stat.c4 .stat-icon'), 'Semantic accent icons must be defined for stats');

console.log('student/dashboard: all verification checks passed.');
