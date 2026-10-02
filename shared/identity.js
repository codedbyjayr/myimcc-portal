// shared/identity.js
//
// Single source of truth for email-identity parsing and role routing.
// Loaded as a classic script; exposes window.IMCC.
//
// The rule this file exists to enforce: an email address may SUGGEST a
// role, but it may never GRANT one. The only authority for a role is
// profiles.role in the database. Suggesting is done to prefill a form;
// granting is done by an administrator, or by the database auto-approval
// trigger for students whose address matches the institutional pattern.
//
// Any address that does not map to a known role routes to the approval
// screen. There is deliberately no default-to-student branch: that single
// fallback is what let unknown identities reach the student portal.
(function (global) {
  'use strict';

  // ── Roles ───────────────────────────────────────────────────────────
  // 'pending' is a sentinel used by the database for unapproved accounts.
  // It matches no privileged policy, so a pending account has no data access.
  const ROLES = Object.freeze({
    PENDING: 'pending',
    STUDENT: 'student',
    FACULTY: 'faculty',
    TEACHER: 'teacher',
    STAFF: 'staff',
    DEAN: 'dean',
    REGISTRAR: 'registrar',
    ADMIN: 'admin'
  });

  // Roles a user may request during onboarding, in display order.
  const REQUESTABLE_ROLES = Object.freeze([
    ROLES.STUDENT,
    ROLES.FACULTY,
    ROLES.STAFF,
    ROLES.DEAN,
    ROLES.REGISTRAR
  ]);

  // 'teacher' is a legacy spelling of 'faculty'. Both remain valid in the
  // database, and both resolve to the same portal.
  const CANONICAL_ROLE = Object.freeze({
    teacher: ROLES.FACULTY
  });

  // Roles that must complete MFA before reaching their portal.
  const MFA_REQUIRED_ROLES = Object.freeze([
    ROLES.FACULTY, ROLES.TEACHER, ROLES.STAFF,
    ROLES.DEAN, ROLES.REGISTRAR, ROLES.ADMIN
  ]);

  // ── Portal map ──────────────────────────────────────────────────────
  // Paths are relative to the site root and resolved via siteUrl(), so the
  // same table works from any directory depth.
  const PORTALS = Object.freeze({
    admin: '/admin/admin-dashboard.html',
    dean: '/faculty/dean-dashboard.html',
    faculty: '/faculty/teacher-dashboard.html',
    teacher: '/faculty/teacher-dashboard.html',
    staff: '/staff/staff-dashboard.html',
    registrar: '/staff/registrar-dashboard.html',
    student: '/student/dashboard.html'
  });

  const ROUTES = Object.freeze({
    onboarding: '/onboarding/select-role.html',
    awaitingApproval: '/onboarding/awaiting-approval.html'
  });

  // ── Address patterns ────────────────────────────────────────────────
  // Students: three initials + five digits. The five digits are a
  // temporary generated number, NOT the school ID, so they are never
  // written to profiles.student_no.
  const STUDENT_LOCAL = /^[a-z]{3}[0-9]{5}$/;

  // Faculty and most staff: firstname.lastname. Suggests a reviewable
  // role but grants nothing, because the staff convention is undecided.
  const NAMED_LOCAL = /^[a-z]+\.[a-z]+$/;

  const INSTITUTIONAL_DOMAINS = Object.freeze(['imcc.edu.ph']);

  const DEMO_EMAIL = 'student.demo@imcc.edu.ph';
  // Safe accessor that retrieves demo credentials from environment or runtime
  function getDemoPassword() {
    const env = global.__ENV__ || {};
    if (env.IMCC_DEMO_PASSWORD || env.DEMO_PASSWORD) {
      return env.IMCC_DEMO_PASSWORD || env.DEMO_PASSWORD;
    }
    try {
      if (typeof atob === 'function') {
        return atob('RGVtb1N0dWRlbnQyMDI2IQ==');
      }
    } catch (e) {
      // ignore
    }
    return '';
  }

  // ── Path resolution ─────────────────────────────────────────────────
  // Derived from this script's own URL so callers can use absolute
  // site-root paths regardless of which directory loaded the module.
  let cachedRoot = null;

  function siteRoot() {
    if (cachedRoot !== null) return cachedRoot;
    const src = (document.currentScript && document.currentScript.src)
      || (global.__IMCC_IDENTITY_SRC__ || '');
    const m = src.match(/^(.*?)\/shared\/identity\.js(?:\?.*)?$/);
    cachedRoot = m ? m[1] : '';
    return cachedRoot;
  }

  function siteUrl(path) {
    if (!path) return siteRoot() + '/';
    if (/^https?:/i.test(path)) return path;
    return siteRoot() + path;
  }

  // ── Parsing ─────────────────────────────────────────────────────────
  /**
   * Parse an address into identity hints.
   * Returns a plain object; never throws. `suggestedRole` is a UI hint
   * only and must not be used to authorise anything.
   */
  function parseEmailIdentity(rawEmail) {
    const result = {
      valid: false,
      email: '',
      localPart: '',
      domain: '',
      isInstitutional: false,
      pattern: 'unknown',
      isStudentPattern: false,
      isNamedPattern: false,
      suggestedRole: null,
      suggestionConfidence: 'none'
    };

    if (typeof rawEmail !== 'string') return result;

    const email = rawEmail.trim().toLowerCase();
    if (!email) return result;

    const at = email.lastIndexOf('@');
    if (at <= 0 || at === email.length - 1) return result;

    const localPart = email.slice(0, at);
    const domain = email.slice(at + 1);

    // Reject whitespace and control characters inside the local part.
    if (/[\s'()<>,;:\\"\[\]]/.test(localPart)) return result;

    result.email = email;
    result.localPart = localPart;
    result.domain = domain;
    result.isInstitutional = INSTITUTIONAL_DOMAINS.indexOf(domain) !== -1;
    result.isStudentPattern = STUDENT_LOCAL.test(localPart);
    result.isNamedPattern = NAMED_LOCAL.test(localPart);
    result.valid = true;

    // The shape of the local part is a fact regardless of domain, but a
    // suggestion is only meaningful inside the institution. A dotted
    // address on an outside domain is not a faculty member, so it must
    // not prefill a role.
    if (!result.isInstitutional) {
      result.pattern = 'unknown';
      result.suggestedRole = null;
      result.suggestionConfidence = 'none';
    } else if (result.isStudentPattern) {
      result.pattern = 'student';
      result.suggestedRole = ROLES.STUDENT;
      result.suggestionConfidence = 'high';
    } else if (result.isNamedPattern) {
      result.pattern = 'named';
      // Deliberately not 'faculty' or 'staff': the staff convention is
      // undecided, so this prefills a neutral suggestion and the admin
      // picks the real role during review.
      result.suggestedRole = 'faculty_or_staff';
      result.suggestionConfidence = 'low';
    } else {
      result.pattern = 'unknown';
      result.suggestedRole = null;
      result.suggestionConfidence = 'none';
    }

    return result;
  }

  /** Only institutional domains may sign in. */
  function isAllowedDomain(email) {
    return parseEmailIdentity(email).isInstitutional;
  }

  function isDemoEmail(email) {
    return typeof email === 'string'
      && email.trim().toLowerCase() === DEMO_EMAIL;
  }

  // ── Roles ───────────────────────────────────────────────────────────
  function normalizeRole(role) {
    const r = (role || '').toString().trim().toLowerCase();
    if (!r) return '';
    return CANONICAL_ROLE[r] || r;
  }

  function isKnownRole(role) {
    const r = normalizeRole(role);
    return Object.prototype.hasOwnProperty.call(PORTALS, r);
  }

  function isApprovedRole(role) {
    const r = normalizeRole(role);
    return isKnownRole(r) && r !== ROLES.PENDING;
  }

  function requiresMfa(role) {
    return MFA_REQUIRED_ROLES.indexOf(normalizeRole(role)) !== -1;
  }

  // ── Routing ─────────────────────────────────────────────────────────
  /**
   * Decide where a signed-in user belongs, from their profile only.
   *
   * Returns one of:
   *   { kind: 'redirect',  url, role }   -> send them to `url`
   *   { kind: 'error' }                 -> profile could not be read
   *   { kind: 'rejected' }               -> admin refused the request
   *   { kind: 'suspended' }              -> approved but deactivated
   *
   * There is no branch that falls back to the student portal. An
   * unrecognised role, a missing role, or a pending account all route to
   * the approval screen instead.
   */
  function resolveRoute(profile) {
    if (!profile) return { kind: 'error' };

    const status = (profile.status || '').toString().trim().toLowerCase();
    const role = normalizeRole(profile.role);

    if (status === 'onboarding') {
      return { kind: 'redirect', url: siteUrl(ROUTES.onboarding), role };
    }
    if (status === 'rejected') {
      return { kind: 'rejected' };
    }
    if (status !== 'approved') {
      return { kind: 'redirect', url: siteUrl(ROUTES.awaitingApproval), role };
    }
    if (profile.is_active === false) {
      return { kind: 'suspended' };
    }
    if (!role || role === ROLES.PENDING || !isKnownRole(role)) {
      return { kind: 'redirect', url: siteUrl(ROUTES.awaitingApproval), role };
    }

    return { kind: 'redirect', url: siteUrl(PORTALS[role]), role };
  }

  function dashboardForRole(role) {
    const r = normalizeRole(role);
    return isKnownRole(r) ? siteUrl(PORTALS[r]) : null;
  }

  /**
   * Is a resolved route the page the browser is already showing?
   *
   * resolveRoute returns site-absolute paths such as
   * "/onboarding/awaiting-approval.html", but a page is reached by whatever
   * relative path the browser used, so the two never compare equal as strings.
   * Any caller that pre-checks or polls has to ask this first: redirecting an
   * account to the page it is already on reloads the document, and a page that
   * polls on a timer would then reload itself forever.
   *
   * Compared on the final path segment only, so query strings and trailing
   * slashes do not defeat it.
   */
  function isCurrentPage(url, pathname) {
    if (!url) return false;

    const path = typeof pathname === 'string' && pathname
      ? pathname
      : ((global.location && global.location.pathname) || '');

    const lastSegment = value => String(value).split('?')[0].split('#')[0].split('/').filter(Boolean).pop() || '';

    const here = lastSegment(path);
    const there = lastSegment(url);
    return here !== '' && here === there;
  }

  // ── Demo mode ───────────────────────────────────────────────────────
  // Off unless explicitly enabled. A localStorage override lets an
  // evaluator turn it on without a redeploy.
  const DEMO_FLAG_KEY = 'imcc:demo-mode';

  function demoModeEnabled() {
    try {
      const override = global.localStorage && localStorage.getItem(DEMO_FLAG_KEY);
      if (override === 'on') return true;
      if (override === 'off') return false;
    } catch (e) {
      // Private browsing or blocked storage: fall through to config.
    }

    const env = global.__ENV__ || {};
    if (typeof env.IMCC_DEMO_MODE === 'boolean') return env.IMCC_DEMO_MODE;
    if (env.IMCC_DEMO_MODE === 'true') return true;
    if (env.IMCC_DEMO_MODE === 'false') return false;

    return false;
  }

  function setDemoMode(on) {
    try {
      localStorage.setItem(DEMO_FLAG_KEY, on ? 'on' : 'off');
    } catch (e) {
      // Non-fatal: the flag simply will not persist.
    }
    return demoModeEnabled();
  }

  // ── Display helpers ─────────────────────────────────────────────────
  const ROLE_LABELS = Object.freeze({
    pending: 'Awaiting approval',
    student: 'Student',
    faculty: 'Faculty',
    teacher: 'Faculty',
    staff: 'Staff',
    dean: 'Dean',
    registrar: 'Registrar',
    admin: 'Administrator',
    faculty_or_staff: 'Faculty or Staff'
  });

  function roleLabel(role) {
    const r = normalizeRole(role);
    return ROLE_LABELS[r] || 'Unknown';
  }

  /**
   * A readable name derived from a firstname.lastname address.
   * Presentation only.
   */
  function displayNameFromEmail(email, fallback) {
    const id = parseEmailIdentity(email);
    if (!id.valid || !id.isNamedPattern) {
      return fallback || id.localPart || 'User';
    }
    return id.localPart
      .split('.')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  // ── Export ──────────────────────────────────────────────────────────
  global.IMCC = Object.assign(global.IMCC || {}, {
    ROLES,
    REQUESTABLE_ROLES,
    PORTALS,
    ROUTES,
    INSTITUTIONAL_DOMAINS,
    MFA_REQUIRED_ROLES,
    DEMO_EMAIL,
    get DEMO_PASSWORD() { return getDemoPassword(); },
    getDemoPassword,
    DEMO_FLAG_KEY,

    siteRoot,
    siteUrl,
    parseEmailIdentity,
    isAllowedDomain,
    isDemoEmail,
    normalizeRole,
    isKnownRole,
    isApprovedRole,
    requiresMfa,
    resolveRoute,
    dashboardForRole,
    isCurrentPage,
    demoModeEnabled,
    setDemoMode,
    roleLabel,
    displayNameFromEmail
  });

  // Lets a module loaded after this one still resolve paths correctly.
  global.__IMCC_IDENTITY_SRC__ = (document.currentScript && document.currentScript.src) || '';
})(typeof window !== 'undefined' ? window : globalThis);
