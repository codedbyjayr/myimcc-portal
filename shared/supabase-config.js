// shared/supabase-config.js
// ─────────────────────────────────────────────────────────────────────
// SINGLE source of truth for the Supabase client.
// Every page loads this file. No other file may use `const/let/var supabase = createClient(...)`.
// ─────────────────────────────────────────────────────────────────────
//
// ARCHITECTURE:
//   This file creates the Supabase client and stores it as
//   window.__myimcc_supabase_client__. All other scripts read from
//   that global. This avoids the "Identifier 'supabase' has already
//   been declared" SyntaxError that occurs when multiple files each
//   do `const supabase = createClient(...)`.
//
// CONFIG SOURCES (tried in order):
//   1. window.__SUPABASE_CONFIG__  — set via inline <script> in HTML <head>
//   2. /api/config                — Node.js backend (docker-compose setup)
//   3. Hardcoded fallback          — for plain nginx/Dockerfile deploys
//
// ⚠  This file is gitignored (contains real credentials on server).
//     Only commit supabase-config.example.js with placeholder values.
// ─────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  // Prevent double init
  if (window.__myimcc_supabase_init_started__) return;
  window.__myimcc_supabase_init_started__ = true;

  function createClient(url, anonKey) {
    window.__myimcc_supabase_client__ = window.supabase.createClient(url, anonKey);
    window.dispatchEvent(new CustomEvent('supabase:ready'));
    return window.__myimcc_supabase_client__;
  }

  // Strategy 1: Inline config (synchronous — fastest)
  if (window.__SUPABASE_CONFIG__) {
    createClient(window.__SUPABASE_CONFIG__.url, window.__SUPABASE_CONFIG__.anonKey);
    return;
  }

  // Strategy 2: Backend API (async)
  fetch('/api/config')
    .then(r => r.ok ? r.json() : null)
    .then(cfg => {
      if (cfg && cfg.supabaseUrl && cfg.supabaseAnonKey) {
        createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
      } else {
        // Strategy 3: Hardcoded fallback
        createClient(
          'https://YOUR_PROJECT_ID.supabase.co',
          'YOUR_ANON_KEY_HERE'
        );
      }
    })
    .catch(() => {
      // Strategy 3: Hardcoded fallback (API unreachable)
      createClient(
        'https://YOUR_PROJECT_ID.supabase.co',
        'YOUR_ANON_KEY_HERE'
      );
    });
})();

// ── Utility Functions (shared across all pages) ─────────────────────

const ALLOWED_SUFFIXES = [
  '@student.imcc.edu.ph',
  '@faculty.imcc.edu.ph',
  '@admin.imcc.edu.ph',
  '@imcc.edu.ph',
  '@student.school.edu',
  '@faculty.school.edu',
  '@admin.school.edu',
];

function isAllowedDomain(email) {
  const lower = String(email || '').toLowerCase().trim();
  return ALLOWED_SUFFIXES.some(suf => lower.endsWith(suf));
}

function roleFromEmail(email) {
  const lower = String(email || '').toLowerCase();
  if (lower.endsWith('@faculty.imcc.edu.ph') || lower.endsWith('@faculty.school.edu')) return 'Faculty';
  if (lower.endsWith('@admin.imcc.edu.ph') || lower.endsWith('@admin.school.edu')) return 'Admin';
  if (lower.endsWith('@imcc.edu.ph')) return 'Staff';
  return 'Student';
}

// ── Auth Guard (used by dashboard pages) ────────────────────────────
async function requireAuth(allowedRoles) {
  const client = await getSupabaseClientAsync();
  if (!client) {
    console.error('[requireAuth] Supabase client not initialized.');
    window.location.href = '/student/login.html';
    return null;
  }

  const { data: { session }, error: sessionErr } = await client.auth.getSession();
  if (sessionErr || !session) {
    window.location.href = '/student/login.html';
    return null;
  }

  // Check MFA AAL level
  try {
    const { data: aalData } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalData.currentLevel !== 'aal2') {
      window.location.href = '/student/login.html';
      return null;
    }
  } catch (_) {
    // MFA check failed — allow through (some setups may not enforce MFA)
  }

  const user = session.user;
  const role = roleFromEmail(user.email);

  if (allowedRoles && allowedRoles.length > 0) {
    const roleLower = role.toLowerCase();
    if (!allowedRoles.includes(roleLower)) {
      console.warn(`[requireAuth] Role '${role}' not allowed. Required: ${allowedRoles.join(', ')}`);
      window.location.href = '/student/login.html';
      return null;
    }
  }

  // Fetch profile
  let profile = null;
  try {
    const { data } = await client.from('profiles').select('*').eq('id', user.id).single();
    profile = data;
  } catch (_) { }

  return { user, profile, role };
}

// Async getter — waits for client if needed
function getSupabaseClientAsync() {
  return new Promise((resolve) => {
    if (window.__myimcc_supabase_client__) {
      resolve(window.__myimcc_supabase_client__);
      return;
    }
    const handler = () => {
      window.removeEventListener('supabase:ready', handler);
      resolve(window.__myimcc_supabase_client__);
    };
    window.addEventListener('supabase:ready', handler);
    // Timeout after 10s
    setTimeout(() => {
      window.removeEventListener('supabase:ready', handler);
      resolve(window.__myimcc_supabase_client__ || null);
    }, 10000);
  });
}

// Sync getter — returns null if not yet initialized (for login.js bootstrap)
function getSupabaseClient() {
  return window.__myimcc_supabase_client__ || null;
}
