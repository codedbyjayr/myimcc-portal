// auth/login.js
document.addEventListener('DOMContentLoaded', async () => {
  let supabaseClient;
  try {
    supabaseClient = await getSupabaseClientAsync();
  } catch (e) {
    console.error("Failed to init Supabase", e);
    return;
  }

  // Domain Helper supporting student, faculty, admin, and general domains
  function isAllowedDomain(email) {
    const allowed = ['@student.imcc.edu.ph', '@faculty.imcc.edu.ph', '@admin.imcc.edu.ph', '@imcc.edu.ph'];
    return allowed.some(domain => email.toLowerCase().endsWith(domain));
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

  // Database-driven Router: Fetch status & role from 'profiles' table
  async function routeUserByProfile(user) {
    const { data: profile, error } = await supabaseClient
      .from('profiles')
      .select('role, status')
      .eq('id', user.id)
      .single();

    if (error || !profile) {
      console.error("Profile fetch error:", error);
      window.location.href = '../student/dashboard.html';
      return;
    }

    if (profile.status === 'onboarding') {
      window.location.href = '../onboarding/select-role.html';
      return;
    }

    if (profile.status === 'pending') {
      window.location.href = '../onboarding/awaiting-approval.html';
      return;
    }

    if (profile.status === 'rejected') {
      alert('Your account request was rejected by the administrator.');
      await supabaseClient.auth.signOut();
      showStep(stepSso);
      return;
    }

    const lowerRole = (profile.role || '').toLowerCase();

    switch (lowerRole) {
      case 'teacher':
      case 'faculty':
        window.location.href = '../faculty/teacher-dashboard.html';
        break;
      case 'dean':
        window.location.href = '../faculty/dean-dashboard.html';
        break;
      case 'admin':
        window.location.href = '../admin/admin-dashboard.html';
        break;
      case 'staff':
        window.location.href = '../staff/staff-dashboard.html';
        break;
      case 'student':
      default:
        window.location.href = '../student/dashboard.html';
        break;
    }
  }

  // Step 1: Process Session Flow
  async function processAuthFlow(session) {
    if (!session) {
      showStep(stepSso);
      return;
    }

    // Check domain restriction on the returned OAuth email
    if (session.user?.email && !isAllowedDomain(session.user.email)) {
      await supabaseClient.auth.signOut();
      showStep(stepUnauthorized);
      return;
    }

    // Check if user is already fully authenticated (AAL2)
    const { data: aalData } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalData?.currentLevel === 'aal2') {
      await routeUserByProfile(session.user);
      return;
    }

    // Check MFA Factors
    const { data: factorData, error: fErr } = await supabaseClient.auth.mfa.listFactors();
    if (fErr) {
      console.error("MFA listFactors error:", fErr);
      showStep(stepSso);
      return;
    }

    const verifiedTotpFactors = (factorData?.totp || []).filter(f => f.status === 'verified');
    if (verifiedTotpFactors.length === 0) {
      // Clean up any unverified stale factors before starting new enrollment
      const unverifiedFactors = (factorData?.totp || []).filter(f => f.status === 'unverified');
      for (const factor of unverifiedFactors) {
        await supabaseClient.auth.mfa.unenroll({ factorId: factor.id });
      }
      await startEnrollment();
    } else {
      await startChallenge(verifiedTotpFactors[0].id);
    }
  }

  // Step 2: Set up clean auth listener letting Supabase handle URL code exchange natively
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    console.log("Auth event:", event, session ? "Session active" : "No session");

    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      if (session) {
        await processAuthFlow(session);
      }
    } else if (event === 'INITIAL_SESSION') {
      if (session) {
        await processAuthFlow(session);
      } else {
        const hasAuthParams = window.location.search.includes('code=') || window.location.hash.includes('access_token=');
        if (!hasAuthParams) {
          showStep(stepSso);
        }
      }
    } else if (event === 'SIGNED_OUT') {
      showStep(stepSso);
    }
  });

  // Explicitly catch, parse, and exchange tokens or codes from ngrok / OAuth redirect URL
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const queryParams = new URLSearchParams(window.location.search);

  const accessToken = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token');
  const authCode = queryParams.get('code');

  if (accessToken && refreshToken) {
    console.log("Detected manual tokens in URL hash, setting session...");
    const { data: setSessionData, error: setSessionError } = await supabaseClient.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (!setSessionError && setSessionData?.session) {
      window.history.replaceState({}, document.title, window.location.pathname);
      await processAuthFlow(setSessionData.session);
    }
  } else if (authCode) {
    console.log("Detected auth code in URL query, executing code exchange...");
    try {
      const { data: exchangeData, error: exchangeError } = await supabaseClient.auth.exchangeCodeForSession(authCode);
      if (!exchangeError && exchangeData?.session) {
        window.history.replaceState({}, document.title, window.location.pathname);
        await processAuthFlow(exchangeData.session);
      } else if (exchangeError) {
        console.warn("Manual exchangeCodeForSession error (may already be handled by client):", exchangeError.message);
      }
    } catch (e) {
      console.warn("Code exchange exception:", e);
    }
  }

  // Fallback explicit check for standard session on load
  const hasAuthParams = window.location.search.includes('code=') || window.location.hash.includes('access_token=');
  if (hasAuthParams) {
    console.log("Checking existing session state...");
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (session && !sessionError) {
      window.history.replaceState({}, document.title, window.location.pathname);
      await processAuthFlow(session);
    }
  }

  // SSO Submission with Google Hosted Domain (hd) Parameter & Direct Redirect Integration
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
        const redirectUrl = window.location.origin + window.location.pathname;
        const { error: oauthError } = await supabaseClient.auth.signInWithOAuth({
          provider: 'google',
          options: {
            queryParams: {
              login_hint: email,
              hd: 'imcc.edu.ph' // Restricts/hints the Google auth window strictly to the school domain
            },
            redirectTo: redirectUrl, // Points directly to the login page to capture the callback
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
        await routeUserByProfile(user);
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
        await routeUserByProfile(user);
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

  const toggleSecretBtn = document.getElementById('toggleSecretBtn');
  if (toggleSecretBtn && enrollSecret) {
    toggleSecretBtn.addEventListener('click', () => {
      if (enrollSecret.textContent === '••••••••••••••••••••') {
        enrollSecret.textContent = activeSecret;
        toggleSecretBtn.textContent = 'Hide Key';
      } else {
        enrollSecret.textContent = '••••••••••••••••••••';
        toggleSecretBtn.textContent = 'Show Key';
      }
    });
  }
});