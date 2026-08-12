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

  // Domain & Role Helpers
  function isAllowedDomain(email) {
    const allowed = ['@student.imcc.edu.ph', '@faculty.imcc.edu.ph', '@admin.imcc.edu.ph', '@imcc.edu.ph'];
    return allowed.some(domain => email.toLowerCase().endsWith(domain));
  }

  function roleFromEmail(email) {
    if (!email) return 'student';
    const lower = email.toLowerCase();
    if (lower.endsWith('@faculty.imcc.edu.ph')) return 'faculty';
    if (lower.endsWith('@admin.imcc.edu.ph')) return 'admin';
    if (lower.includes('staff')) return 'staff';
    return 'student';
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

  // 2. Fixed routing: Works both on GitHub Pages (/myimcc-portal/...) and Localhost
  function redirectUser(role) {
    const basePath = window.location.pathname.includes('/myimcc-portal') ? '/myimcc-portal' : '';
    const lower = role.toLowerCase();

    if (lower === 'faculty') {
      window.location.href = `${basePath}/faculty/teacher-dashboard.html`;
    } else if (lower === 'admin') {
      window.location.href = `${basePath}/admin/admin-dashboard.html`;
    } else if (lower === 'staff') {
      window.location.href = `${basePath}/staff/staff-dashboard.html`;
    } else {
      window.location.href = `${basePath}/student/dashboard.html`;
    }
  }

  async function bootstrap() {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error || !session) {
      showStep(stepSso);
      return;
    }

    // Check if user is already fully authenticated (AAL2)
    const { data: aalData } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalData?.currentLevel === 'aal2') {
      const { data: { user } } = await supabaseClient.auth.getUser();
      redirectUser(roleFromEmail(user?.email || activeEmail));
      return;
    }

    const { data: factorData, error: fErr } = await supabaseClient.auth.mfa.listFactors();
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

  if (ssoForm) {
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
        const { error: oauthError } = await supabaseClient.auth.signInWithOAuth({
          provider: 'google',
          options: {
            queryParams: { login_hint: email },
            redirectTo: window.location.origin + window.location.pathname,
          },
        });
        if (oauthError) throw oauthError;
      } catch (err) {
        showError(ssoError, err.message || 'Authentication failed.');
        ssoBtn.disabled = false;
      }
    });
  }

  async function startEnrollment() {
    try {
      const { data, error } = await supabaseClient.auth.mfa.enroll({ factorType: 'totp' });
      if (error) throw error;

      pendingFactorId = data.id;
      activeSecret = data.totp.secret;

      if (enrollQrImg) enrollQrImg.src = data.totp.qr_code;
      if (enrollSecret) enrollSecret.textContent = '••••••••••••••••••••';
      if (enrollCodeInput) enrollCodeInput.value = '';

      showStep(stepEnroll);
      if (enrollCodeInput) enrollCodeInput.focus();
    } catch (err) {
      showError(enrollError, err.message || 'Could not start MFA enrollment.');
      showStep(stepEnroll);
    }
  }

  if (enrollForm) {
    enrollForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError(enrollError);
      const code = enrollCodeInput.value.trim();

      if (!code || code.length !== 6) {
        showError(enrollError, 'Please enter a valid 6-digit TOTP verification code.');
        return;
      }

      try {
        const { data: ch, error: chErr } = await supabaseClient.auth.mfa.challenge({ factorId: pendingFactorId });
        if (chErr) throw chErr;
        pendingChallengeId = ch.id;

        const { error: vErr } = await supabaseClient.auth.mfa.verify({
          factorId: pendingFactorId,
          challengeId: pendingChallengeId,
          code,
        });
        if (vErr) throw vErr;

        const { data: { user } } = await supabaseClient.auth.getUser();
        redirectUser(roleFromEmail(user?.email || activeEmail));
      } catch (err) {
        showError(enrollError, err.message || 'Verification failed. Check your app timer.');
      }
    });
  }

  async function startChallenge(factorId) {
    try {
      const { data: ch, error } = await supabaseClient.auth.mfa.challenge({ factorId });
      if (error) throw error;
      pendingFactorId = factorId;
      pendingChallengeId = ch.id;
      if (challengeCodeInput) challengeCodeInput.value = '';
      showStep(stepChallenge);
      if (challengeCodeInput) challengeCodeInput.focus();
    } catch (err) {
      showError(challengeError, err.message || 'Could not start verification.');
      showStep(stepChallenge);
    }
  }

  if (challengeForm) {
    challengeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError(challengeError);
      const code = challengeCodeInput.value.trim();

      if (!code || code.length !== 6) {
        showError(challengeError, 'Please enter your 6-digit Authenticator code.');
        return;
      }

      try {
        const { error } = await supabaseClient.auth.mfa.verify({
          factorId: pendingFactorId,
          challengeId: pendingChallengeId,
          code,
        });
        if (error) throw error;

        const { data: { user } } = await supabaseClient.auth.getUser();
        redirectUser(roleFromEmail(user?.email || activeEmail));
      } catch (err) {
        showError(challengeError, err.message || 'Invalid TOTP code. Try again.');
      }
    });
  }

  if (resetMfaBtn) {
    resetMfaBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!confirm('Are you sure you want to reset your 2FA pairing key?')) return;

      try {
        const { data: factorData } = await supabaseClient.auth.mfa.listFactors();
        const totpFactors = factorData?.totp || [];
        for (const f of totpFactors) {
          await supabaseClient.auth.mfa.unenroll({ factorId: f.id });
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
      if (emailInput) emailInput.focus();
    });
  }

  bootstrap();
});