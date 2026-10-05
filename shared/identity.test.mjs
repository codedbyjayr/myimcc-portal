// Unit tests for shared/identity.js
// Run: node shared/identity.test.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('./identity.js', import.meta.url), 'utf8');

let passed = 0;
const failures = [];

function eq(actual, expected, label) {
  if (actual === expected) { passed++; return; }
  failures.push(`${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`);
}

// ── Load the module with stubbed browser globals ─────────────────────
function loadModule({ src, env, storage } = {}) {
  const store = new Map(Object.entries(storage || {}));
  const sandbox = {
    console,
    document: { currentScript: { src: src || 'https://portal.test/shared/identity.js' } },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v))
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.__ENV__ = env || {};
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'identity.js' });
  return sandbox.window.IMCC;
}

const IMCC = loadModule();

// ── Address parsing ──────────────────────────────────────────────────
const p = (e) => IMCC.parseEmailIdentity(e);

eq(p('abc12345@imcc.edu.ph').pattern, 'student', 'student pattern recognised');
eq(p('abc12345@imcc.edu.ph').suggestedRole, 'student', 'student pattern suggests student');
eq(p('abc12345@imcc.edu.ph').suggestionConfidence, 'high', 'student suggestion is high confidence');
eq(p('ABC12345@IMCC.EDU.PH').isStudentPattern, true, 'parsing is case insensitive');
eq(p('  abc12345@imcc.edu.ph  ').localPart, 'abc12345', 'surrounding whitespace trimmed');

eq(p('maria.santos@imcc.edu.ph').pattern, 'named', 'dotted name recognised');
eq(p('maria.santos@imcc.edu.ph').suggestedRole, 'faculty_or_staff',
  'dotted name must NOT suggest a concrete role while the staff convention is undecided');
eq(p('maria.santos@imcc.edu.ph').suggestionConfidence, 'low', 'dotted name is low confidence');

eq(p('random.person@gmail.com').pattern, 'unknown', 'external address is unknown');
eq(p('random.person@gmail.com').suggestedRole, null, 'unknown address suggests nothing');
eq(p('random.person@gmail.com').isInstitutional, false, 'gmail is not institutional');
eq(p('random.person@gmail.com').isNamedPattern, true,
  'dotted gmail still matches the named pattern but is not institutional');

for (const bad of ['', '   ', 'nodomain', '@imcc.edu.ph', 'abc@', 'a b@imcc.edu.ph',
                   "o'brien@imcc.edu.ph", 'ab\nc@imcc.edu.ph', 'ab\tc@imcc.edu.ph',
                   null, undefined, 42, {}]) {
  eq(p(bad).valid, false, `rejects malformed address: ${JSON.stringify(bad)}`);
}

// A trailing newline is whitespace around the address, not inside it,
// so trimming it and accepting the address is the correct behaviour.
eq(p('abc@imcc.edu.ph\n').valid, true, 'trailing newline is trimmed, not rejected');

eq(p('ab1234@imcc.edu.ph').isStudentPattern, false, 'two letters + four digits is not the student pattern');
eq(p('abcd12345@imcc.edu.ph').isStudentPattern, false, 'four letters is not the student pattern');
eq(p('abc123456@imcc.edu.ph').isStudentPattern, false, 'six digits is not the student pattern');

eq(IMCC.isAllowedDomain('anyone@imcc.edu.ph'), true, 'institutional domain allowed');
eq(IMCC.isAllowedDomain('anyone@gmail.com'), false, 'external domain rejected');

// ── Path resolution ──────────────────────────────────────────────────
eq(IMCC.siteUrl('/student/dashboard.html'), 'https://portal.test/student/dashboard.html',
  'site-relative path resolved against script URL');
const deep = loadModule({ src: 'https://portal.test/shared/identity.js' });
eq(deep.siteUrl('/admin/admin-dashboard.html'), 'https://portal.test/admin/admin-dashboard.html',
  'path resolution is independent of caller directory');

// ── Role normalisation ───────────────────────────────────────────────
eq(IMCC.normalizeRole('Teacher'), 'faculty', 'legacy teacher normalises to faculty');
eq(IMCC.normalizeRole('ADMIN'), 'admin', 'role is case insensitive');
eq(IMCC.normalizeRole(null), '', 'null role normalises to empty');
eq(IMCC.isKnownRole('registrar'), true, 'registrar is a known role');
eq(IMCC.isKnownRole('pending'), false, 'pending is a sentinel, not a portal role');
eq(IMCC.isKnownRole('wizard'), false, 'invented role is not known');
eq(IMCC.isApprovedRole('faculty'), true, 'faculty is approved');
eq(IMCC.isApprovedRole('pending'), false, 'pending is never an approved role');

eq(IMCC.requiresMfa('student'), false, 'students are not forced into MFA');
for (const r of ['faculty', 'teacher', 'staff', 'dean', 'registrar', 'admin']) {
  eq(IMCC.requiresMfa(r), true, `${r} requires MFA`);
}

// ── Routing: the core of the fix ─────────────────────────────────────
const R = IMCC.resolveRoute;
const STUDENT_URL = 'https://portal.test/student/dashboard.html';
const FACULTY_URL = 'https://portal.test/faculty/teacher-dashboard.html';
const AWAIT_URL = 'https://portal.test/onboarding/awaiting-approval.html';
const ONBOARD_URL = 'https://portal.test/onboarding/select-role.html';

eq(R({ role: 'student', status: 'approved' }).url, STUDENT_URL, 'approved student -> student portal');
eq(R({ role: 'faculty', status: 'approved' }).url, FACULTY_URL, 'approved faculty -> faculty portal');
eq(R({ role: 'teacher', status: 'approved' }).url, FACULTY_URL, 'approved teacher -> faculty portal');
eq(R({ role: 'registrar', status: 'approved' }).url,
  'https://portal.test/staff/registrar-dashboard.html', 'registrar -> registrar portal');
eq(R({ role: 'dean', status: 'approved' }).url,
  'https://portal.test/faculty/dean-dashboard.html', 'dean -> dean portal');
eq(R({ role: 'admin', status: 'approved' }).url,
  'https://portal.test/admin/admin-dashboard.html', 'admin -> admin portal');

// The original defect: an unknown role fell through to the student portal.
for (const bad of ['wizard', '', null, undefined, 'pending']) {
  const r = R({ role: bad, status: 'approved' });
  eq(r.url, AWAIT_URL, `unknown role ${JSON.stringify(bad)} must route to approval, NOT student`);
}
eq(R({ role: 'superuser', status: 'approved' }).url === STUDENT_URL, false,
  'no role may ever resolve to the student portal by default');

eq(R({ role: 'pending', status: 'pending' }).url, AWAIT_URL, 'pending account -> approval screen');
eq(R({ role: 'faculty', status: 'pending' }).url, AWAIT_URL, 'unapproved faculty -> approval screen');
eq(R({ role: 'student', status: 'onboarding' }).url, ONBOARD_URL, 'onboarding status -> select-role');
eq(R({ role: 'faculty', status: 'rejected' }).kind, 'rejected', 'rejected status is signalled');
eq(R({ role: 'student', status: 'approved', is_active: false }).kind, 'suspended',
  'deactivated account is suspended, not routed');
eq(R(null).kind, 'error', 'missing profile is an error, not a student');
eq(R(undefined).kind, 'error', 'undefined profile is an error');
eq(R({}).url, AWAIT_URL, 'empty profile object routes to approval');

// An approved but role-less account must not be treated as a student.
eq(R({ status: 'approved' }).url === STUDENT_URL, false,
  'approved with no role must not default to student');

eq(IMCC.dashboardForRole('wizard'), null, 'unknown role has no dashboard');
eq(IMCC.dashboardForRole('dean'),
  'https://portal.test/faculty/dean-dashboard.html', 'dashboardForRole resolves dean');

// ── Demo mode ────────────────────────────────────────────────────────
eq(IMCC.demoModeEnabled(), false, 'demo mode is OFF by default');
eq(loadModule({ env: { IMCC_DEMO_MODE: true } }).demoModeEnabled(), true, 'env boolean enables demo');
eq(loadModule({ env: { IMCC_DEMO_MODE: 'false' } }).demoModeEnabled(), false, 'env string "false" disables demo');
eq(loadModule({ storage: { 'imcc:demo-mode': 'on' } }).demoModeEnabled(), true, 'localStorage override on');
eq(loadModule({ storage: { 'imcc:demo-mode': 'off' }, env: { IMCC_DEMO_MODE: true } }).demoModeEnabled(),
  false, 'localStorage "off" beats env "on"');
eq(IMCC.isDemoEmail('STUDENT.DEMO@IMCC.EDU.PH'), true, 'demo email is case insensitive');
eq(IMCC.isDemoEmail('abc12345@imcc.edu.ph'), false, 'real student is not the demo account');

// ── Display helpers ──────────────────────────────────────────────────
eq(IMCC.displayNameFromEmail('maria.santos@imcc.edu.ph'), 'Maria Santos', 'dotted name prettified');
// A non-named address has no prettifiable name, so the caller's real
// profile name is more useful than the email local part.
eq(IMCC.displayNameFromEmail('abc12345@imcc.edu.ph', 'Juan Dela Cruz'), 'Juan Dela Cruz',
  'non-named address falls back to the supplied profile name');
eq(IMCC.displayNameFromEmail('abc12345@imcc.edu.ph'), 'abc12345',
  'with no fallback, the local part is used rather than an empty string');
eq(IMCC.roleLabel('teacher'), 'Faculty', 'teacher labelled as Faculty');
eq(IMCC.roleLabel('pending'), 'Awaiting approval', 'pending has a human label');
eq(IMCC.roleLabel('wizard'), 'Unknown', 'unknown role labelled Unknown');

// ── Report ───────────────────────────────────────────────────────────
// ─── Same-page detection ─────────────────────────────────────────────────────
// Guards a reload loop. awaiting-approval.html polls resolveRoute every 20s, and
// a still-pending account resolves to awaiting-approval.html itself. Without a
// correct same-page check the poll redirects the document to its own URL and
// the page reloads forever.
eq(IMCC.isCurrentPage('/onboarding/awaiting-approval.html', '/onboarding/awaiting-approval.html'),
  true, 'identical absolute path is the current page');
eq(IMCC.isCurrentPage('/onboarding/awaiting-approval.html', 'awaiting-approval.html'),
  true, 'relative path matches the absolute route it came from');
eq(IMCC.isCurrentPage('/onboarding/awaiting-approval.html', '/onboarding/awaiting-approval.html?v=2'),
  true, 'query string does not defeat the comparison');
eq(IMCC.isCurrentPage('/onboarding/awaiting-approval.html', '/onboarding/awaiting-approval.html#top'),
  true, 'fragment does not defeat the comparison');
eq(IMCC.isCurrentPage('/onboarding/select-role.html', '/onboarding/awaiting-approval.html'),
  false, 'a different page is not the current page');
eq(IMCC.isCurrentPage('/student/dashboard.html', '/onboarding/awaiting-approval.html'),
  false, 'a portal is not the current page');

// The loop this exists to prevent, stated directly: a pending account on the
// waiting page must not be told to navigate to the waiting page.
const pendingRoute = IMCC.resolveRoute({ status: 'pending', role: 'pending' });
eq(pendingRoute.kind, 'redirect', 'a pending account resolves to a redirect');
eq(IMCC.isCurrentPage(pendingRoute.url, '/onboarding/awaiting-approval.html'),
  true, 'pending route is recognised as this page, so no self-redirect');
eq(IMCC.resolveRoute({ status: 'onboarding', role: 'pending' }).kind, 'redirect',
  'onboarding resolves to a redirect');
eq(IMCC.isCurrentPage(IMCC.resolveRoute({ status: 'onboarding', role: 'pending' }).url,
  '/onboarding/select-role.html'),
  true, 'onboarding route is recognised as the role page itself');

// Degrade safely rather than throwing when there is nothing to compare.
eq(IMCC.isCurrentPage(null, '/onboarding/select-role.html'), false, 'null url is not the current page');
eq(IMCC.isCurrentPage('', '/onboarding/select-role.html'), false, 'empty url is not the current page');
eq(IMCC.isCurrentPage('/onboarding/select-role.html', ''), false, 'empty pathname is not the current page');
eq(IMCC.isCurrentPage('/onboarding/select-role.html', '/'), false, 'a directory index is not a page match');
eq(IMCC.isCurrentPage('/x/', '/x/'), true, 'the same bare directory is the same page');
eq(IMCC.isCurrentPage('/x/index.html', '/x/'), false, 'a directory index and a named file are different pages');

console.log(`\nidentity.js: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFAILURES:');
  failures.forEach(f => console.log('  x ' + f));
  process.exit(1);
}
console.log('OK\n');
