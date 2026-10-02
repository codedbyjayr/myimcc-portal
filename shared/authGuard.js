// shared/authGuard.js
//
// Validates session, approval status and role for a portal page, and
// redirects to the correct portal when the user does not belong here.
//
// Role-to-portal mapping lives in shared/identity.js so that login,
// onboarding and every portal agree on one answer. This file falls back
// to a local map if identity.js is absent, so it never hard-fails on
// script load order, but the two must not drift: identity.js is the
// source of truth.
(function (global) {
  'use strict';

  const LOGIN_PATH = '/auth/login.html';

  // Fallback map, used only when shared/identity.js has not loaded.
  const FALLBACK_DASHBOARDS = Object.freeze({
    admin: '/admin/admin-dashboard.html',
    dean: '/faculty/dean-dashboard.html',
    faculty: '/faculty/teacher-dashboard.html',
    teacher: '/faculty/teacher-dashboard.html',
    staff: '/staff/staff-dashboard.html',
    registrar: '/staff/registrar-dashboard.html',
    student: '/student/dashboard.html'
  });

  function identity() {
    return global.IMCC || null;
  }

  function siteUrl(path) {
    const imcc = identity();
    if (imcc && typeof imcc.siteUrl === 'function') return imcc.siteUrl(path);
    return path;
  }

  function normalizeRole(role) {
    const imcc = identity();
    if (imcc && typeof imcc.normalizeRole === 'function') return imcc.normalizeRole(role);
    return (role || '').toString().trim().toLowerCase();
  }

  function roleLabel(role) {
    const imcc = identity();
    if (imcc && typeof imcc.roleLabel === 'function') return imcc.roleLabel(role);
    return (role || '').toString().toUpperCase() || 'UNKNOWN';
  }

  /**
   * Where should this user be sent? Never to a portal chosen by guesswork:
   * an unrecognised role resolves to the sign-in screen.
   */
  function destinationFor(profile) {
    const imcc = identity();
    if (imcc && typeof imcc.resolveRoute === 'function') {
      const route = imcc.resolveRoute(profile);
      if (route.kind === 'redirect') return route.url;
      return siteUrl(LOGIN_PATH);
    }

    const role = normalizeRole(profile && profile.role);
    const status = ((profile && profile.status) || '').toString().toLowerCase();

    if (status === 'onboarding') return siteUrl('/onboarding/select-role.html');
    if (status === 'pending') return siteUrl('/onboarding/awaiting-approval.html');
    if (status !== 'approved') return siteUrl(LOGIN_PATH);
    if (!role || role === 'pending') return siteUrl('/onboarding/awaiting-approval.html');

    return Object.prototype.hasOwnProperty.call(FALLBACK_DASHBOARDS, role)
      ? siteUrl(FALLBACK_DASHBOARDS[role])
      : siteUrl(LOGIN_PATH);
  }

  // Blocking alert() for an access decision is jarring and, in the
  // original code, `profile.role.toUpperCase()` threw a TypeError when
  // role was null. This renders a dismissible notice instead.
  function showGuardNotice(message, detail) {
    const existing = document.getElementById('imccGuardNotice');
    if (existing) existing.remove();

    const box = document.createElement('div');
    box.id = 'imccGuardNotice';
    box.setAttribute('role', 'alert');
    box.setAttribute('aria-live', 'assertive');
    box.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:9999',
      'display:flex', 'align-items:center', 'justify-content:center',
      'padding:24px', 'background:rgba(20,16,25,.72)',
      'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif'
    ].join(';');

    const card = document.createElement('div');
    card.style.cssText = [
      'max-width:380px', 'background:#fff', 'border-radius:12px',
      'padding:24px', 'box-shadow:0 12px 32px rgba(0,0,0,.24)',
      'border-top:4px solid #E7248A'
    ].join(';');

    const title = document.createElement('h2');
    title.textContent = message;
    title.style.cssText = 'margin:0 0 8px;font-size:17px;color:#141019;font-weight:700';

    const body = document.createElement('p');
    body.textContent = detail;
    body.style.cssText = 'margin:0 0 16px;font-size:14px;color:#6E6680;line-height:1.5';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Go to sign in';
    btn.style.cssText = [
      'background:#E7248A', 'color:#fff', 'border:0', 'border-radius:8px',
      'padding:10px 18px', 'font-size:14px', 'font-weight:600', 'cursor:pointer'
    ].join(';');
    btn.addEventListener('click', () => { window.location.href = siteUrl(LOGIN_PATH); });

    card.append(title, body, btn);
    box.appendChild(card);
    document.body.appendChild(box);
    btn.focus();
  }

  function deny(message, detail, redirectTo) {
    showGuardNotice(message, detail);
    if (redirectTo) {
      // Delay so the notice is readable rather than flashing past.
      setTimeout(() => { window.location.href = redirectTo; }, 2500);
    }
  }

  /**
   * Validates session, status, and role.
   * Redirects automatically if the user does not match the page's allowed roles.
   *
   * @param {Array<string>} allowedRoles - e.g. ['admin'], ['faculty'], ['student']
   * @returns {Promise<{user: object, profile: object}|null>}
   */
  async function initAuthGuard(allowedRoles = []) {
    if (!global.supabaseClient) {
      console.error('[authGuard] Supabase client not found.');
      return null;
    }

    // 1. Authenticate active session
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    if (error || !user) {
      window.location.href = siteUrl(LOGIN_PATH);
      return null;
    }

    // 2. Fetch profile
    const { data: profile, error: pErr } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (pErr || !profile) {
      console.error('[authGuard] Profile fetch failed:', pErr);
      deny(
        'Account not found',
        'We could not load your account. Please contact the registrar\'s office.',
        siteUrl(LOGIN_PATH)
      );
      return null;
    }

    const status = (profile.status || '').toString().toLowerCase();

    // 3. A pending or rejected account belongs on the approval screen, not
    //    bouncing through the sign-in page and back here.
    if (status === 'onboarding') {
      window.location.href = siteUrl('/onboarding/select-role.html');
      return null;
    }
    if (status === 'pending') {
      window.location.href = siteUrl('/onboarding/awaiting-approval.html');
      return null;
    }
    if (status === 'rejected') {
      deny(
        'Account request declined',
        'Your request was not approved. Please contact the registrar\'s office.',
        siteUrl(LOGIN_PATH)
      );
      return null;
    }
    if (status !== 'approved') {
      deny(
        'Account not approved',
        `Your account status is "${profile.status || 'unknown'}". Please contact the registrar's office.`,
        siteUrl(LOGIN_PATH)
      );
      return null;
    }

    // 4. Deactivated accounts keep their role so an admin can restore
    //    them, but must not reach a portal.
    if (profile.is_active === false) {
      deny(
        'Account deactivated',
        'This account has been deactivated. Please contact the registrar\'s office.',
        siteUrl(LOGIN_PATH)
      );
      return null;
    }

    // 5. Role guard
    const role = normalizeRole(profile.role);
    const allowed = (allowedRoles || []).map(normalizeRole);

    if (!role || role === 'pending' || !allowed.includes(role)) {
      const target = destinationFor(profile);
      if (target === siteUrl(LOGIN_PATH)) {
        deny(
          'Access not permitted',
          'Your account does not have access to this page.',
          target
        );
      } else {
        deny(
          'Taking you to your portal',
          `Your assigned role is ${roleLabel(role)}.`,
          target
        );
      }
      return null;
    }

    // 6. React to live admin changes
    listenForRoleChanges(user.id, allowed);

    return { user, profile };
  }

  // ── Live Supabase Realtime Listener ────────────────────────────────
  function listenForRoleChanges(userId, currentAllowedRoles) {
    if (!global.supabaseClient || typeof supabaseClient.channel !== 'function') return;

    supabaseClient
      .channel(`public:profiles:id=eq.${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`
        },
        (payload) => {
          const updated = payload.new || {};
          const status = (updated.status || '').toString().toLowerCase();

          if (status !== 'approved' || updated.is_active === false) {
            deny(
              status === 'rejected' ? 'Account request declined' : 'Access changed',
              'An administrator changed your account. Redirecting to sign in.',
              siteUrl(LOGIN_PATH)
            );
            return;
          }

          const role = normalizeRole(updated.role);
          if (!currentAllowedRoles.includes(role)) {
            deny(
              'Role updated',
              `Your role is now ${roleLabel(role)}. Taking you to the right portal.`,
              destinationFor(updated)
            );
          }
        }
      )
      .subscribe();
  }

  // Expose both the guard and the map, so pages that referenced
  // ROLE_DASHBOARDS directly keep working.
  global.ROLE_DASHBOARDS = FALLBACK_DASHBOARDS;
  global.initAuthGuard = initAuthGuard;
})(typeof window !== 'undefined' ? window : globalThis);
