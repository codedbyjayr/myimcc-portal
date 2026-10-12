// Smoke test for auth/login assets
// Run: node auth/login.test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert';

const html = readFileSync(new URL('./login.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('./login.css', import.meta.url), 'utf8');
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

// 2. Dead AI-slop / zombie rules purged from CSS
const deadSelectors = ['.password-wrap', '.eye-btn', '.remember', '.card-stack', '.mini-card', '.mc-bar', '.right-support', '.portal-info-panel'];
for (const selector of deadSelectors) {
  assert(!css.includes(selector), `Dead selector ${selector} should not exist in login.css`);
}
assert(!css.includes('.login-right { display: none; }'), 'login-right should not be hidden on mobile');

// 3. Google OAuth hd constraint present in login.js
assert(js.includes("hd: 'imcc.edu.ph'"), "Missing hd: 'imcc.edu.ph' constraint in login.js");

console.log('auth/login: all checks passed.');
