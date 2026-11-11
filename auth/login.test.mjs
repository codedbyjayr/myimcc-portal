// Smoke test for auth/login assets
// Run: node auth/login.test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import { dashboardMarkup } from '../scripts/dashboard-markup.mjs';

const html = await dashboardMarkup(new URL('./login.html', import.meta.url));
const js = readFileSync(new URL('./login.js', import.meta.url), 'utf8');

// 1. Required DOM IDs exist in HTML
const requiredIds = [
  'stepSso', 'stepEnroll', 'stepChallenge', 'stepUnauthorized',
  'ssoForm', 'emailInput', 'ssoBtn', 'ssoBtnText', 'ssoError',
  'enrollForm', 'enrollQrImg', 'enrollSecret', 'enrollCodeInput', 'enrollError', 'enrollBtn',
  'challengeForm', 'challengeCodeInput', 'challengeError', 'challengeBtn',
  'retrySsoBtn', 'resetMfaBtn', 'skipEnrollBtn', 'toggleSecretBtn'
];

for (const id of requiredIds) {
  assert(html.includes(`id="${id}"`), `Missing ID #${id} in login.html`);
}

assert.match(html, /<script src="login\.js" type="text\/imcc-controller" data-dashboard-controller>/);
assert.match(html, /src="\.\.\/shared\/dist\/login\.js"/);
assert.match(html, /href="\.\.\/shared\/dist\/portal\.css"/);

// 3. Google OAuth hd constraint present in login.js
assert(js.includes("hd: 'imcc.edu.ph'"), "Missing hd: 'imcc.edu.ph' constraint in login.js");

console.log('auth/login: all checks passed.');
