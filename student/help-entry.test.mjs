import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const dashboard = readFileSync(new URL('./dashboard.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('./dashboard.html', import.meta.url), 'utf8');
const start = dashboard.indexOf('function toggleChat(force)'), end = dashboard.indexOf('// ── MFA Configuration Module', start);
let focused = false, open = false, expanded;
const listeners = {};
const elements = Object.fromEntries(['chatFab', 'chatPanel', 'chatClose', 'helpInput'].map(id => [id, {
  addEventListener: (event, fn) => { listeners[`${id}:${event}`] = fn; },
  setAttribute: (_, value) => { expanded = value; },
  focus: () => { focused = true; },
  togglePopover: force => {
    open = force ?? !open;
    listeners['chatPanel:toggle']({ newState: open ? 'open' : 'closed' });
  },
}]));
const context = vm.createContext({ window: {}, getEl: id => elements[id] });
vm.runInContext(dashboard.slice(start, end), context);
assert.equal(open, false);
context.window.toggleChat();
assert.equal(open, true);
assert.equal(expanded, 'true');
assert(focused);
context.window.toggleChat(false);
assert.equal(open, false);
assert.equal(expanded, 'false');
context.window.toggleChat(true);
context.window.toggleChat(true);
assert.equal(open, true);
context.window.toggleChat();
assert.equal(open, false);
listeners['chatPanel:toggle']({ newState: 'closed' });
assert.equal(expanded, 'false');
let destination, scrolled = false;
context.window.toggleChat(true);
vm.runInNewContext('(' + dashboard.slice(dashboard.indexOf('function revealBooking(question)'), dashboard.indexOf('function bookStatusBadge')) + ')()', {
  toggleChat: context.window.toggleChat, goto: page => { destination = page; },
  getEl: id => id === 'bookCard' ? { scrollIntoView: () => { scrolled = true; } } : null,
});
assert.equal(open, false);
assert.equal(destination, 'help');
assert(scrolled);
assert(!dashboard.includes('getLocalFaqAnswer'));
assert.match(html, /id="chatPanel" popover="auto" role="dialog"/);
assert.match(html, /aria-controls="chatPanel" aria-expanded="false"/);
assert.match(html, /<label for="enrollmentTerm">Enrollment term<\/label>/);
assert.match(html, /id="helpLog" role="log" aria-live="polite"/);
assert.match(html, /for="helpInput"/);
assert.match(dashboard, /response\.data\?\.resolved === true/);
console.log('Student chat: collapsed entry, toggle, focus, consultation handoff and enrollment label passed.');
