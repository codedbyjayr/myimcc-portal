-- =====================================================================
-- MyIMCC Portal — Database MFA Enforcement Rollback
--
-- Safely removes restrictive MFA policies from candidate tables
-- and removes the is_mfa_compliant() function.
--
-- Does NOT drop or alter public.user_mfa or any existing data.
-- =====================================================================

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
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'mfa_restrictive_' || t, t);
      RAISE NOTICE 'Removed restrictive MFA policy from public.%', t;
    END IF;
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.is_mfa_compliant();
