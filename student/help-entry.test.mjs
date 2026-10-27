import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const dashboard = readFileSync(new URL('./dashboard.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('./dashboard.html', import.meta.url), 'utf8');
const start = dashboard.indexOf('function toggleChat()'), end = dashboard.indexOf('// ── MFA Configuration Module', start);
let focused = false, destination;
vm.runInNewContext(dashboard.slice(start, end), {
  window: {}, goto: value => { destination = value; }, requestAnimationFrame: fn => fn(),
  getEl: id => id === 'chatFab' ? { addEventListener: (_, fn) => fn() } : { focus: () => { focused = true; } },
});
assert.equal(destination, 'help');
assert(focused);
assert(!dashboard.includes('getLocalFaqAnswer'));
assert(!html.includes('id="chatPanel"'));
assert.match(html, /id="helpLog" role="log" aria-live="polite"/);
assert.match(html, /for="helpInput"/);
assert.match(dashboard, /response\.data\?\.resolved === true/);
console.log('Student Help entry: navigation, focus, live log and published-answer state passed.');
