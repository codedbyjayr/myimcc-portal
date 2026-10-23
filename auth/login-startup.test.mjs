import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
let start;
const elements = { ssoError: { hidden: true, textContent: '' }, ssoBtn: { disabled: false } };
vm.runInNewContext(readFileSync('auth/login.js', 'utf8'), {
  document: { addEventListener: (_, callback) => { start = callback; }, getElementById: id => elements[id] },
  getSupabaseClientAsync: async () => { throw new Error('Missing config'); },
  console: { error() {} },
});
await start();
assert.equal(elements.ssoError.hidden, false);
assert.match(elements.ssoError.textContent, /temporarily unavailable/);
assert.equal(elements.ssoBtn.disabled, true);
console.log('Login startup failure is visible and disables sign-in.');
