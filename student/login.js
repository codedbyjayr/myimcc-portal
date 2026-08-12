// student/login.js
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Wait for the dynamic Supabase client to load
  let supabaseClient;
  try {
    supabaseClient = await getSupabaseClientAsync();
  } catch (e) {
    console.error("Failed to init Supabase", e);
    return;
  }

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

  let activeEmail = '';
  let pendingFactorId = null;
  let pendingChallengeId = null;
  let activeSecret = '';

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

  // 2. Fixed routing: Use absolute paths from the root domain to prevent 404s
  function redirectUser(role) {
    const lower = role.toLowerCase();
    if (lower === 'faculty') {
      window.location.href = '/faculty/teacher-dashboard.html';
    } else if (lower === 'admin') {
      window.location.href = '/admin/admin-dashboard.html';
    } else if (lower === 'staff') {
      window.location.href = '/staff/staff-dashboard.html';
    } else {
      window.location.href = '/student/dashboard.html';
    }
  }

  async function bootstrap() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) {
      showStep(stepSso);
      return;
    }

    // Check if user is already fully authenticated (AAL2)
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalData.currentLevel === 'aal2') {
      const { data: { user } } = await supabase.auth.getUser();
      redirectUser(roleFromEmail(user?.email || activeEmail));
      return;
    }

    const { data: factorData, error: fErr } = await supabase.auth.mfa.listFactors();
    if (fErr) {
      showStep(stepSso);
      return;
    }

    const totpFactors = factorData?.totp || [];
    if (totpFactors.length === 0) {
      await startEnrollment();
    } else {
      await startChallenge(totpFactors[0].id);
    }
  }

  ssoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(ssoError);
    const email = emailInput.value.trim();

    if (!email) {
      showError(ssoError, 'Please enter your official institutional email.');
      return;
    }

    if (!isAllowedDomain(email)) {
      showStep(stepUnauthorized);
      return;
    }

    activeEmail = email;
    ssoBtn.disabled = true;

    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          queryParams: { login_hint: email },
          // Use origin + pathname to avoid passing query params into the redirect
          redirectTo: window.location.origin + window.location.pathname,
        },
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      showError(ssoError, err.message || 'Authentication failed.');
      ssoBtn.disabled = false;
    }
  });

  async function startEnrollment() {
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error) throw error;

      pendingFactorId = data.id;
      activeSecret = data.totp.secret;

      enrollQrImg.src = data.totp.qr_code;
      enrollSecret.textContent = '••••••••••••••••••••';
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

    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: pendingFactorId });
      if (chErr) throw chErr;
      pendingChallengeId = ch.id;

      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: pendingFactorId,
        challengeId: pendingChallengeId,
        code,
      });
      if (vErr) throw vErr;

      const { data: { user } } = await supabase.auth.getUser();
      redirectUser(roleFromEmail(user?.email || activeEmail));
    } catch (err) {
      showError(enrollError, err.message || 'Verification failed. Check your app timer.');
    }
  });

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

  if (resetMfaBtn) {
    resetMfaBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!confirm('Are you sure you want to reset your 2FA pairing key?')) return;

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

  if (retrySsoBtn) {
    retrySsoBtn.addEventListener('click', () => {
      showStep(stepSso);
      emailInput.focus();
    });
  }

  bootstrap();
});