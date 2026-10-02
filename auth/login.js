// auth/login.js
document.addEventListener('DOMContentLoaded', async () => {
  let supabaseClient;
  try {
    supabaseClient = await getSupabaseClientAsync();
  } catch (e) {
    console.error("Failed to init Supabase", e);
    return;
  }

  // shared/identity.js owns address parsing and role routing. If it did
  // not load, stop rather than guess at roles.
  if (!window.IMCC) {
    console.error("shared/identity.js failed to load; refusing to route on role.");
    return;
  }

  // Domain Helper: only institutional school emails may sign in.
  const isAllowedDomain = window.IMCC.isAllowedDomain;

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
  const skipEnrollBtn = document.getElementById('skipEnrollBtn');

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

  // Database-driven Router: Fetch status & role from 'profiles' table.
  // The destination is decided by IMCC.resolveRoute, which has no
  // fallback to the student portal. An unrecognised role, a pending
  // account, or a missing role all route to the approval screen.
  async function routeUserByProfile(user) {
    const { data: profile, error } = await supabaseClient
      .from('profiles')
      .select('role, status, is_active')
      .eq('id', user.id)
      .single();

    if (error || !profile) {
      console.error("Profile fetch error:", error);
      showError(ssoError, "Could not load your account. Please contact the registrar's office.");
      showStep(stepSso);
      return;
    }

    const route = window.IMCC.resolveRoute(profile);

    switch (route.kind) {
      case 'redirect':
        window.location.href = route.url;
        return;

      case 'rejected':
        showError(ssoError, 'Your account request was not approved. Please contact the registrar\'s office.');
        await supabaseClient.auth.signOut();
        showStep(stepSso);
        return;

      case 'suspended':
        showError(ssoError, 'This account has been deactivated. Please contact the registrar\'s office.');
        await supabaseClient.auth.signOut();
        showStep(stepSso);
        return;

      default:
        // 'error' is already handled above; anything else must not fall
        // through to a portal on a guess.
        showError(ssoError, 'Could not determine your portal. Please contact the registrar\'s office.');
        showStep(stepSso);
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

    if (verifiedTotpFactors.length > 0) {
      // User has MFA set up — require them to complete the challenge
      await startChallenge(verifiedTotpFactors[0].id);
    } else {
      // No MFA set up yet — fetch their role and route directly at AAL1.
      // Only students are prompted to enroll MFA (optional). Other roles go straight to their dashboard.
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('role, status')
        .eq('id', session.user.id)
        .single();

      if (!profile) {
        // Can't determine role — return to the sign-in step rather than
        // guessing a portal.
        showStep(stepSso);
        return;
      }

      const role = window.IMCC.normalizeRole(profile.role);

      if (window.IMCC.requiresMfa(role)) {
        // Staff, faculty, dean, registrar and admin must enrol in MFA.
        // Previously these roles were routed straight through at AAL1,
        // which is why the login page claimed MFA was required for
        // faculty while the code never enforced it.
        const unverifiedFactors = (factorData?.totp || []).filter(f => f.status === 'unverified');
        for (const factor of unverifiedFactors) {
          await supabaseClient.auth.mfa.unenroll({ factorId: factor.id });
        }
        await startEnrollment(false);
        return;
      }

      if (role === 'student') {
        // Students are invited (opt-in) to set up MFA for extra security, but can skip
        // Clean up any unverified stale factors before starting new enrollment
        const unverifiedFactors = (factorData?.totp || []).filter(f => f.status === 'unverified');
        for (const factor of unverifiedFactors) {
          await supabaseClient.auth.mfa.unenroll({ factorId: factor.id });
        }
        await startEnrollment(true);
      } else {
        // Unrecognised role with no MFA requirement: let the router decide,
        // which will send it to approval rather than to a portal.
        await routeUserByProfile(session.user);
      }
    }
  }


  // Step 2: Clean auth listener letting Supabase manage URL code exchange
  let authFlowInProgress = false;

  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    console.log("Auth event:", event, session ? "Session active" : "No session");

    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      if (session && !authFlowInProgress) {
        authFlowInProgress = true;
        window.history.replaceState({}, document.title, window.location.pathname);
        await processAuthFlow(session);
      }
    } else if (event === 'INITIAL_SESSION') {
      if (session && !authFlowInProgress) {
        authFlowInProgress = true;
        window.history.replaceState({}, document.title, window.location.pathname);
        await processAuthFlow(session);
      } else if (!session) {
        const hasAuthParams = window.location.search.includes('code=') || 
                              window.location.hash.includes('access_token=');
        if (!hasAuthParams) {
          showStep(stepSso);
        }
      }
    } else if (event === 'SIGNED_OUT') {
      authFlowInProgress = false;
      showStep(stepSso);
    }
  });

  // Check URL parameters for OAuth errors or pending callback
  const queryParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const oauthError = queryParams.get('error_description') || queryParams.get('error') ||
                     hashParams.get('error_description') || hashParams.get('error');

  if (oauthError) {
    console.error("OAuth Error:", oauthError);
    window.history.replaceState({}, document.title, window.location.pathname);
    showError(ssoError, oauthError);
    showStep(stepSso);
  } else {
    const hasAuthParams = window.location.search.includes('code=') || 
                          window.location.hash.includes('access_token=');
    if (hasAuthParams) {
      if (ssoBtn) ssoBtn.disabled = true;
      const ssoBtnText = document.getElementById('ssoBtnText');
      if (ssoBtnText) ssoBtnText.textContent = 'Verifying School Account...';

      // Safety timeout: If Supabase does not resolve session within 4 seconds (e.g. stale/expired code)
      setTimeout(async () => {
        if (!authFlowInProgress) {
          const { data: { session } } = await supabaseClient.auth.getSession();
          if (session) {
            authFlowInProgress = true;
            window.history.replaceState({}, document.title, window.location.pathname);
            await processAuthFlow(session);
          } else {
            console.warn("OAuth callback timeout - no valid session established.");
            window.history.replaceState({}, document.title, window.location.pathname);
            if (ssoBtn) ssoBtn.disabled = false;
            if (ssoBtnText) ssoBtnText.textContent = 'Sign In with Google / School Account';
            showError(ssoError, 'Sign-in session expired or invalid. Please click Sign In again.');
            showStep(stepSso);
          }
        }
      }, 4000);
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

      if (window.IMCC.isDemoEmail(email) && window.IMCC.demoModeEnabled()) {
        await loginAsDemoStudent();
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

  // ── Demo Student Access ─────────────────────────────────────────────
  const demoStudentBtn = document.getElementById('demoStudentBtn');
  const demoStatus = document.getElementById('demoStatus');

  async function loginAsDemoStudent() {
    // Re-check at call time, not only at click time.
    if (!window.IMCC.demoModeEnabled()) {
      showError(ssoError, 'Demo access is not enabled on this deployment.');
      return;
    }

    if (demoStudentBtn) {
      demoStudentBtn.disabled = true;
      demoStudentBtn.innerHTML = '<span>⏳</span> Signing in as Demo Student...';
    }
    if (demoStatus) {
      demoStatus.style.display = 'block';
      demoStatus.removeAttribute('data-state');
      demoStatus.textContent = 'Authenticating demo session...';
    }

    try {
      const { error } = await supabaseClient.auth.signInWithPassword({
        email: window.IMCC.DEMO_EMAIL,
        password: window.IMCC.DEMO_PASSWORD
      });
      if (error) throw error;

      if (demoStatus) demoStatus.textContent = 'Redirecting to Student Dashboard...';
      // Re-enter the normal flow so the demo account is routed by its own
      // profile, rather than being hard-coded to the student portal.
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session) {
        await processAuthFlow(session);
      } else {
        window.location.href = window.IMCC.siteUrl('/student/dashboard.html');
      }
    } catch (err) {
      console.error('Demo sign-in failed:', err);
      if (demoStatus) {
        demoStatus.setAttribute('data-state', 'error');
        demoStatus.textContent = 'Error: demo sign-in failed.';
      }
      if (demoStudentBtn) {
        demoStudentBtn.disabled = false;
        demoStudentBtn.innerHTML = 'One-Click Sign In as Demo Student';
      }
    }
  }

  // The demo card and its credentials are removed from the DOM unless
  // demo mode is explicitly enabled, so the password is not shipped to
  // end users in page source on a normal deployment.
  const demoCard = document.querySelector('.demo-access-card');
  const demoModeOn = window.IMCC.demoModeEnabled();

  if (demoCard) {
    if (demoModeOn) {
      demoCard.removeAttribute('hidden');
      // Filled from config rather than hard-coded in the markup, so the
      // credentials exist in exactly one place.
      const emailText = document.getElementById('demoEmailText');
      const passwordText = document.getElementById('demoPasswordText');
      if (emailText) emailText.textContent = window.IMCC.DEMO_EMAIL;
      if (passwordText) passwordText.textContent = window.IMCC.DEMO_PASSWORD;
    } else {
      demoCard.remove();
    }
  }
  if (!demoModeOn && demoStudentBtn) {
    demoStudentBtn.remove();
  }

  demoStudentBtn?.addEventListener('click', loginAsDemoStudent);

  async function startEnrollment(canSkip = false) {
    try {
      if (skipEnrollBtn) {
        skipEnrollBtn.style.display = canSkip ? 'inline-block' : 'none';
      }
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

  if (skipEnrollBtn) {
    skipEnrollBtn.addEventListener('click', async () => {
      try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user) {
          await routeUserByProfile(user);
        } else {
          showStep(stepSso);
        }
      } catch (err) {
        console.error('Skip MFA enrollment error:', err);
        showStep(stepSso);
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