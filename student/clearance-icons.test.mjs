import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadDashboardView } from '../scripts/dashboard-markup.mjs';

const { ClearanceCards } = await loadDashboardView(new URL('./dashboard-view.tsx', import.meta.url));
const departments = [
  ['cashier', 'Cashier'], ['dean', 'Dean'], ['dsa', 'Dean of Student Affairs (DSA)'],
  ['guidance', 'Guidance'], ['laboratory', 'Laboratory/Nursing Arts/Cybershack'],
  ['library', 'Library'], ['medical', 'Medical/Dental Clinic'], ['property', 'Property Custodian'],
  ['registrar', 'Registrar'], ['rotc', 'ROTC/CWTS'], ['library', 'Demo Library'], ['registrar', 'Unknown office'],
];
const markup = renderToStaticMarkup(createElement(ClearanceCards, {
  departments: departments.map(([icon, name], index) => ({
    id: String(index), department_code: name === 'Cashier' ? icon : '',
    department_name: name, status: name === 'Cashier' ? 'action_required' : '__proto__',
    note: '<script>untrusted</script>', icon: '<img src="untrusted">',
  })),
}));
const icons = [...markup.matchAll(/data-office-icon="([a-z]+)"/g)].map(match => match[1]);
assert.deepEqual(icons, departments.map(([icon]) => icon));
assert(!markup.includes('<script>') && !markup.includes('src="untrusted"'), 'Database text is escaped and icon markup is ignored');
assert(markup.includes('&lt;script&gt;untrusted'));
assert(markup.includes('Clearance requirements'));
assert(!markup.includes('data-goto="billing"'), 'Cashier clearance cannot open Billing');
assert(markup.includes('Awaiting Department Review'), 'Unrecognized statuses use pending copy');
const noNote = status => renderToStaticMarkup(createElement(ClearanceCards, {
  departments: [{ department_code: 'dean', department_name: 'Dean', status, note: '  ' }],
}));
assert.match(noNote('pending'), /No requirements posted yet/);
assert.doesNotMatch(noNote('cleared'), /No requirements posted yet|Office note/);
for (const icon of new Set(icons)) {
  const png = readFileSync(new URL(`./icons/clearance/${icon}.png`, import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 512);
}
const credits = readFileSync(new URL('./icons/clearance/credits.html', import.meta.url), 'utf8');
assert.equal((credits.match(/https:\/\/thenounproject.com\/icon\//g) || []).length, 10);
console.log('Clearance icons: ten offices, student affairs before dean, demo names, unknown fallback, local PNGs and credits passed.');
