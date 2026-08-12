// =====================================================================
// MyIMCC Single Sign-On (SSO) + 2FA (TOTP) Authentication Logic
// Supabase-native rewrite. Same UI flow / DOM elements as original.
//   Step 1 (#stepSso)        — Institutional email → Google OAuth
//   Step 2A (#stepEnroll)     — TOTP enrollment (new pairing)
//   Step 2B (#stepChallenge)  — TOTP verification (existing pairing)
//   (#stepUnauthorized)       — Invalid email domain
// =====================================================================

// ⚠ Replace these with your real project values from the Supabase dashboard.
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Allowed institutional email suffixes (kept in sync with the small hint text
// shown under the email input in login.html — UI is untouched).
const ALLOWED_SUFFIXES = [
  '@student.imcc.edu.ph',
  '@faculty.imcc.edu.ph',
  '@admin.imcc.edu.ph',
  '@imcc.edu.ph',
  '@student.school.edu',
  '@faculty.school.edu',
  '@admin.school.edu',
];

document.addEventListener('DOMContentLoaded', () => {
  const stepSso = document.getElementById('stepSso');
  const stepEnroll = document.getElementById('stepEnroll');
  const stepChallenge = document.getElementById('stepChallenge');
  const stepUnauthorized = document.getElementById('stepUnauthorized');

  const ssoForm = document.getElementById('ssoForm');
  const emailInput = document.getElementById('emailInput');
  const ssoBtn = document.getElementById('ssoBtn');
  const ssoError = document.getElementById('ssoError');

  const enrollForm = document.getElementById('enrollForm');
  const enrollQrImg = document.getElementById('enrollQrImg');
  const enrollSecret = document.getElementById('enrollSecret');
  const enrollCodeInput = document.getElementById('enrollCodeInput');
  const enrollError = document.getElementById('enrollError');

  const challengeForm = document.getElementById('challengeForm');
  const challengeCodeInput = document.getElementById('challengeCodeInput');
  const challengeError = document.getElementById('challengeError');

  const retrySsoBtn = document.getElementById('retrySsoBtn');
  const resetMfaBtn = document.getElementById('resetMfaBtn');

  // Supabase MFA session state (kept in-memory only).
  let activeEmail = '';
  let pendingFactorId = null;      // factor id returned by mfa.enroll()
  let pendingChallengeId = null;   // challenge id returned by mfa.challenge()
  let activeSecret = '';           // TOTP secret shown under the QR

  function showStep(stepEl) {
    [stepSso, stepEnroll, stepChallenge, stepUnauthorized].forEach(el => {
      if (el) el.style.display = 'none';
    });
    if (stepEl) stepEl.style.display = 'block';
  }

  function showError(errorEl, message) {
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    }
  }
  function hideError(errorEl) {
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.hidden = true;
    }
  }

  const toggleSecretBtn = document.getElementById('toggleSecretBtn');
  let secretVisible = false;
  if (toggleSecretBtn) {
    toggleSecretBtn.addEventListener('click', () => {
      secretVisible = !secretVisible;
      if (secretVisible) {
        enrollSecret.textContent = activeSecret;
        toggleSecretBtn.textContent = 'Hide Key';
      } else {
        enrollSecret.textContent = '••••••••••••••••••••';
        toggleSecretBtn.textContent = 'Show Key';
      }
    });
  }

  // ---------- Helpers ----------------------------------------------------

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

  function redirectUser(role) {
    const lower = role.toLowerCase();
    if (lower === 'faculty') {
      window.location.href = 'faculty/teacher-dashboard.html';
    } else if (lower === 'admin') {
      window.location.href = 'admin/admin-dashboard.html';
    } else if (lower === 'staff') {
      window.location.href = 'staff/staff-dashboard.html';
    } else {
      window.location.href = 'dashboard.html';
    }
  }

  // ---------- Bootstrap: detect existing session / AAL ------------------

  async function bootstrap() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) {
      // No active session — show SSO step.
      showStep(stepSso);
      return;
    }

    // We have a session at AAL1. Decide enroll vs challenge.
    const { data: factorData, error: fErr } = await supabase.auth.mfa.listFactors();
    if (fErr) {
      console.warn('listFactors error:', fErr);
      showStep(stepSso);
      return;
    }

    const totpFactors = factorData?.totp || [];
    if (totpFactors.length === 0) {
      // No TOTP factor yet — start enrollment.
      await startEnrollment();
    } else {
      // Has at least one factor — challenge it.
      await startChallenge(totpFactors[0].id);
    }
  }

  // ---------- Step 1: SSO ----------------------------------------------

  ssoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(ssoError);
    const email = emailInput.value.trim();

    if (!email) {
      showError(ssoError, 'Please enter your official institutional email.');
      return;
    }

    // Domain gate (mirrors the original UI behaviour).
    if (!isAllowedDomain(email)) {
      showStep(stepUnauthorized);
      return;
    }

    ssoBtn.disabled = true;
    try {
      // Native Supabase OAuth — Google Workspace SSO. The browser is redirected
      // to Google's consent screen and back to this same page (redirectTo).
      // After the redirect, bootstrap() picks up the new session.
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          queryParams: { login_hint: email },
          redirectTo: window.location.href,
        },
      });
      if (oauthError) throw oauthError;
      // Browser will redirect; nothing else to do here.
    } catch (err) {
      showError(ssoError, err.message || 'Authentication failed.');
      ssoBtn.disabled = false;
    }
  });

  // ---------- Step 2A: TOTP Enrollment ----------------------------------

  async function startEnrollment() {
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error) throw error;

      pendingFactorId = data.id;
      activeSecret = data.totp.secret;
      secretVisible = false;

      // data.totp.qr_code is a base64 data-URL PNG — drop straight into <img>.
      enrollQrImg.src = data.totp.qr_code;
      enrollSecret.textContent = '••••••••••••••••••••';
      if (toggleSecretBtn) toggleSecretBtn.textContent = 'Show Key';
      enrollCodeInput.value = '';

      showStep(stepEnroll);
      enrollCodeInput.focus();
    } catch (err) {
      showError(enrollError, err.message || 'Could not start MFA enrollment.');
      showStep(stepEnroll);
    }
  }

  enrollForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(enrollError);
    const code = enrollCodeInput.value.trim();

    if (!code || code.length !== 6) {
      showError(enrollError, 'Please enter a valid 6-digit TOTP verification code.');
      return;
    }
    if (!pendingFactorId) {
      showError(enrollError, 'Session expired. Please restart sign-in.');
      showStep(stepSso);
      return;
    }

    try {
      // Create a challenge for the just-enrolled factor, then verify the code.
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({
        factorId: pendingFactorId,
      });
      if (chErr) throw chErr;
      pendingChallengeId = ch.id;

      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: pendingFactorId,
        challengeId: pendingChallengeId,
        code,
      });
      if (vErr) throw vErr;

      // AAL is now 2. Read the user's email to determine redirect target.
      const { data: { user } } = await supabase.auth.getUser();
      redirectUser(roleFromEmail(user?.email || activeEmail));
    } catch (err) {
      showError(enrollError, err.message || 'Verification failed. Check your app timer.');
    }
  });

  // ---------- Step 2B: TOTP Challenge ----------------------------------

  async function startChallenge(factorId) {
    try {
      const { data: ch, error } = await supabase.auth.mfa.challenge({ factorId });
      if (error) throw error;
      pendingFactorId = factorId;
      pendingChallengeId = ch.id;
      challengeCodeInput.value = '';
      showStep(stepChallenge);
      challengeCodeInput.focus();
    } catch (err) {
      showError(challengeError, err.message || 'Could not start verification.');
      showStep(stepChallenge);
    }
  }

  challengeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(challengeError);
    const code = challengeCodeInput.value.trim();

    if (!code || code.length !== 6) {
      showError(challengeError, 'Please enter your 6-digit Authenticator code.');
      return;
    }
    if (!pendingFactorId || !pendingChallengeId) {
      showError(challengeError, 'Session expired. Please restart sign-in.');
      showStep(stepSso);
      return;
    }

    try {
      const { error } = await supabase.auth.mfa.verify({
        factorId: pendingFactorId,
        challengeId: pendingChallengeId,
        code,
      });
      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      redirectUser(roleFromEmail(user?.email || activeEmail));
    } catch (err) {
      showError(challengeError, err.message || 'Invalid TOTP code. Try again.');
    }
  });

  // ---------- Reset 2FA (unenroll + re-enroll) --------------------------

  if (resetMfaBtn) {
    resetMfaBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!confirm('Are you sure you want to reset your 2FA pairing key and scan a brand new QR code?')) return;

      try {
        const { data: factorData } = await supabase.auth.mfa.listFactors();
        const totpFactors = factorData?.totp || [];
        for (const f of totpFactors) {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
        await startEnrollment();
      } catch (err) {
        showError(challengeError, err.message || 'Could not reset 2FA.');
      }
    });
  }

  // ---------- Retry from Unauthorized screen ----------------------------

  if (retrySsoBtn) {
    retrySsoBtn.addEventListener('click', () => {
      showStep(stepSso);
      emailInput.focus();
    });
  }

  // ---------- Kick off --------------------------------------------------
  bootstrap();
});
