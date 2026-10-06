// Unit tests for shared/ui.js — escaping, templating, URL safety, formatting.
// Run: node shared/ui.test.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('./ui.js', import.meta.url), 'utf8');

let passed = 0;
const failures = [];
// html`` returns a String subclass so nesting can be detected; compare
// by the marker rather than instanceof, because the class is created in
// the vm sandbox realm and is not the host's String.
const norm = (v) => (v != null && typeof v === 'object' && v.__imccHtml === true) ? v.toString() : v;
function eq(actual, expected, label) {
  actual = norm(actual);
  expected = norm(expected);
  if (actual === expected) { passed++; return; }
  failures.push(`${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`);
}

// Minimal DOM good enough for the pure functions under test.
const created = [];
function makeNode(tag) {
  return {
    tagName: (tag || 'div').toUpperCase(),
    children: [],
    attributes: {},
    style: {},
    _text: '',
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); }, toggle(c, f) { if (f) this.add(c); else this.remove(c); }
    },
    get innerHTML() { return this._html || ''; },
    set innerHTML(v) { this._html = v; },
    get textContent() { return this._text; },
    set textContent(v) { this._text = v; },
    setAttribute(k, v) { this.attributes[k] = v; },
    getAttribute(k) { return this.attributes[k] ?? null; },
    hasAttribute(k) { return k in this.attributes; },
    removeAttribute(k) { delete this.attributes[k]; },
    appendChild(c) { this.children.push(c); created.push(c); return c; },
    addEventListener() {}, removeEventListener() {},
    contains() { return true; }, focus() {}, querySelector() { return null; },
    querySelectorAll() { return []; }
  };
}

const body = makeNode('body');
const sandbox = {
  console,
  setTimeout: () => {},
  clearTimeout: () => {},
  URL,
  location: { href: 'https://portal.test/student/dashboard.html' },
  document: {
    body,
    activeElement: null,
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => makeNode(tag)
  },
  Element: class {}
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(SRC, sandbox, { filename: 'ui.js' });

const U = sandbox.window.UIM;
const { escapeHtml, html, raw, safeUrl, pluralize, formatDate, formatDateTime } = U;

// ── escapeHtml ───────────────────────────────────────────────────────
eq(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;', 'tags are escaped');
eq(escapeHtml('a & b'), 'a &amp; b', 'ampersand escaped');
eq(escapeHtml('"quoted"'), '&quot;quoted&quot;', 'double quote escaped');
eq(escapeHtml("it's"), 'it&#39;s', 'single quote escaped');
eq(escapeHtml(null), '', 'null becomes empty string');
eq(escapeHtml(undefined), '', 'undefined becomes empty string');
eq(escapeHtml(0), '0', 'zero is preserved, not treated as empty');
eq(escapeHtml(false), 'false', 'false is preserved');
eq(escapeHtml(''), '', 'empty string stays empty');

// The exact payload that made the registrar portal exploitable.
const payload = '<img src=x onerror="alert(document.cookie)">';
eq(escapeHtml(payload),
  '&lt;img src=x onerror=&quot;alert(document.cookie)&quot;&gt;',
  'img/onerror payload fully neutralised');

// ── html tagged template ─────────────────────────────────────────────
eq(html`<td>${'Juan Dela Cruz'}</td>`, '<td>Juan Dela Cruz</td>', 'safe value passes through');
eq(html`<td>${payload}</td>`,
  '<td>&lt;img src=x onerror=&quot;alert(document.cookie)&quot;&gt;</td>',
  'html tag escapes interpolated payload');
eq(html`<td>${'<b>bold</b>'}</td>`, '<td>&lt;b&gt;bold&lt;/b&gt;</td>', 'html tag escapes nested tags');
eq(html`<td>${raw('<b>ok</b>')}</td>`, '<td><b>ok</b></td>', 'raw() opts out of escaping');
eq(html`${null}`, '', 'null interpolates to empty');
eq(html`${raw('')}${raw('<hr>')}`, '<hr>', 'adjacent raw fragments concatenate');
eq(html`${['a', 'b']}`, 'ab', 'array fragments concatenate without commas');
eq(html`${['<a>', '<b>']}`, '&lt;a&gt;&lt;b&gt;', 'array elements are each escaped');
eq(html`a${1}b${2}c`, 'a1b2c', 'multiple interpolations in order');
eq(html`no interpolation`, 'no interpolation', 'template with no values');

// The composition case the portals actually use.
const rows = ['one', 'two'];
eq(html`<ul>${rows.map(r => html`<li>${r}</li>`)}</ul>`,
  '<ul><li>one</li><li>two</li></ul>',
  'map over nested html composes without extra escaping');

// Nested html results inline without double-escaping.
const inner = html`<b>${'x & y'}</b>`;
eq(html`<td>${inner}</td>`, '<td><b>x &amp; y</b></td>', 'nested html inlines and is not double-escaped');

// Direct assignment to innerHTML must work: String subclass coerces cleanly.
const cell = makeNode('td');
cell.innerHTML = html`<span>${'ok'}</span>`;
eq(cell.innerHTML, '<span>ok</span>', 'html result assigns cleanly to innerHTML');

// ── safeUrl ──────────────────────────────────────────────────────────
eq(safeUrl('https://example.com/a.png'), 'https://example.com/a.png', 'https allowed');
eq(safeUrl('http://example.com/a.png'), 'http://example.com/a.png', 'http allowed');
eq(safeUrl('/local/path.png'), '/local/path.png', 'root-relative allowed');
eq(safeUrl('images/a.png'), 'images/a.png', 'relative allowed');
eq(safeUrl('#anchor'), '#anchor', 'fragment allowed');
eq(safeUrl('javascript:alert(1)'), '', 'javascript: blocked');
eq(safeUrl('JaVaScRiPt:alert(1)'), '', 'javascript: blocked case-insensitively');
eq(safeUrl('  javascript:alert(1)  '), '', 'javascript: blocked with whitespace');
eq(safeUrl('data:text/html,<script>alert(1)</script>'), '', 'data: blocked');
eq(safeUrl('vbscript:msgbox(1)'), '', 'vbscript: blocked');
eq(safeUrl(''), '', 'empty becomes empty');
eq(safeUrl(null), '', 'null becomes empty');
eq(safeUrl(123), '', 'non-string becomes empty');
eq(safeUrl('javascript:alert(1)', '/fallback.png'), '/fallback.png', 'fallback used when blocked');
eq(safeUrl('', '/fallback.png'), '/fallback.png', 'fallback used when empty');
eq(safeUrl('file:///etc/passwd'), '', 'file: blocked');

// ── Formatting ───────────────────────────────────────────────────────
eq(pluralize(1, 'subject'), '1 subject', 'singular');
eq(pluralize(0, 'subject'), '0 subjects', 'zero is plural');
eq(pluralize(5, 'subject'), '5 subjects', 'plural');
eq(pluralize(2, 'entry', 'entries'), '2 entries', 'irregular plural');
eq(pluralize(undefined, 'subject'), '0 subjects', 'undefined count is zero');

eq(formatDate(null), '', 'null date is empty');
eq(formatDate('not-a-date'), '', 'invalid date is empty');
eq(formatDate('2026-09-26T00:00:00Z').length > 0, true, 'valid date formats to a non-empty string');
eq(formatDateTime(null), '', 'null datetime is empty');
eq(formatDateTime('garbage'), '', 'invalid datetime is empty');

// ── Report ───────────────────────────────────────────────────────────
console.log(`\nui.js: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFAILURES:');
  failures.forEach(f => console.log('  x ' + f));
  process.exit(1);
}
console.log('OK\n');
