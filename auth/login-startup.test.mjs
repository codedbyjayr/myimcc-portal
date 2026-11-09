import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const elements = { ssoError: { hidden: true, textContent: '' }, ssoBtn: { disabled: true } };
await vm.runInNewContext(readFileSync('auth/login.js', 'utf8'), {
  document: { getElementById: id => elements[id] },
  getSupabaseClientAsync: async () => { throw new Error('Missing config'); },
  console: { error() {} },
});
assert.equal(elements.ssoError.hidden, false);
assert.match(elements.ssoError.textContent, /temporarily unavailable/);
assert.equal(elements.ssoBtn.disabled, true);
console.log('Login startup failure is visible and disables sign-in.');
