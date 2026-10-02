-- =====================================================================
-- MyIMCC Portal — Database MFA Enforcement (Opt-In Rollout)
--
-- Replaces custom TOTP MFA with Supabase Auth's built-in TOTP MFA.
--
-- 1. Uses RESTRICTIVE RLS policies on sensitive student tables.
--    PostgreSQL evaluates:
--      (at least one PERMISSIVE policy matches) AND (ALL RESTRICTIVE policies match)
--    This preserves existing ownership, department, faculty, and role policies.
--
-- 2. Safe Opt-In Rollout:
--    - Users who have enrolled & verified a factor in auth.mfa_factors
--      MUST present AAL2 (auth.jwt() ->> 'aal' = 'aal2') to access sensitive records.
--    - Users without a verified factor continue at AAL1 without interruption
--      until MFA is made mandatory.
--
-- 3. Targeted Protection:
--    - Applied only to sensitive student records: grades, grade_history,
--      attendance, clearances, clearance_status, appeals, transactions,
--      installments, and billing_summary.
--    - NOT applied to public / reference tables or profiles, ensuring sign-in
--      and MFA enrollment flows are never blocked.
--
-- 4. No replacement public table is created; legacy public.user_mfa is kept
--    untouched until all migrations and references are confirmed obsolete.
-- =====================================================================

-- ── 1. MFA Compliance Check Function ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_mfa_compliant()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id             UUID;
  v_role                TEXT;
  v_has_verified_factor BOOLEAN := FALSE;
  v_aal                 TEXT;
BEGIN
  -- Service role and administrative maintenance bypass RLS
  v_role := auth.role();
  IF v_role = 'service_role' THEN
    RETURN TRUE;
  END IF;

  -- Must be an authenticated session
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if user has an active, verified factor in Supabase Auth
  IF to_regclass('auth.mfa_factors') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM auth.mfa_factors
      WHERE user_id = v_user_id
        AND status = 'verified'
    ) INTO v_has_verified_factor;
  END IF;

  -- Safe opt-in rollout: allow users without a verified factor to continue
  IF NOT v_has_verified_factor THEN
    RETURN TRUE;
  END IF;

  -- Enrolled users MUST provide AAL2 assurance
  v_aal := (auth.jwt() ->> 'aal');
  RETURN (v_aal = 'aal2');
END;
$$;

COMMENT ON FUNCTION public.is_mfa_compliant() IS
  'Returns TRUE if caller has AAL2 session when enrolled in Supabase Auth MFA, or caller has no verified MFA factor yet.';

REVOKE ALL ON FUNCTION public.is_mfa_compliant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_mfa_compliant() TO authenticated, service_role;

-- ── 2. Apply RESTRICTIVE Policies to Sensitive Student Tables ─────────
DO $$
DECLARE
  t TEXT;
  candidate_tables TEXT[] := ARRAY[
    'grades',
    'grade_history',
    'attendance',
    'clearances',
    'clearance_status',
    'appeals',
    'transactions',
    'installments',
    'billing_summary'
  ];
BEGIN
  FOREACH t IN ARRAY candidate_tables LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NOT NULL THEN
      -- Ensure RLS is enabled on candidate table
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

      -- Drop existing restrictive MFA policy if present
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'mfa_restrictive_' || t, t);

      -- Create restrictive policy: ANDed with existing permissive policies
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_mfa_compliant()) WITH CHECK (public.is_mfa_compliant());',
        'mfa_restrictive_' || t,
        t
      );

      RAISE NOTICE 'Applied restrictive MFA policy on public.%', t;
    ELSE
      RAISE NOTICE 'Skipping public.% (table does not exist in this environment)', t;
    END IF;
  END LOOP;
END $$;
