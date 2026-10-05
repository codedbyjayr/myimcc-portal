-- =====================================================================
-- MyIMCC Portal — Phase 0a Rollback
-- Reverts security-hardening-phase0a.sql ONLY.
-- =====================================================================
--
-- ⚠️  This restores privilege-escalation defect #1: the self-update policy
--    regains no WITH CHECK, so any authenticated user can again set their
--    own role and status to 'admin'. Re-run security-hardening-phase0a.sql
--    as soon as possible after rolling back.
--
-- Also restores defect #2: handle_new_user() goes back to assigning roles
-- from email domain suffixes, and 'registrar' is dropped from the role
-- vocabulary, so registrar accounts can no longer be created.

-- ═════════════════════════════════════════════════════════════════════
-- 1. Restore the original handle_new_user
-- ═════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  lower_email TEXT;
BEGIN
  lower_email := LOWER(NEW.email);
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    CASE
      WHEN lower_email LIKE '%@faculty.%' THEN 'faculty'
      WHEN lower_email LIKE '%@admin.%' THEN 'admin'
      WHEN lower_email LIKE '%@imcc.edu.ph' AND lower_email NOT LIKE '%@student.%'
           AND lower_email NOT LIKE '%@faculty.%' AND lower_email NOT LIKE '%@admin.%' THEN 'staff'
      ELSE 'student'
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═════════════════════════════════════════════════════════════════════
-- 2. Drop the hardening trigger
-- ═════════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS trg_profiles_protect_privileged ON public.profiles;
DROP FUNCTION IF EXISTS public.profiles_protect_privileged();

-- ═════════════════════════════════════════════════════════════════════
-- 3. Restore the original self-update policy (no WITH CHECK)
-- ═════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- ═════════════════════════════════════════════════════════════════════
-- 4. Restore table-level grants
-- ═════════════════════════════════════════════════════════════════════
REVOKE UPDATE (phone, address, avatar_url, requested_role,
               student_no, program, year_level, section, id_number, updated_at)
  ON public.profiles FROM authenticated;
REVOKE INSERT (id, email, full_name, phone, address, avatar_url,
               requested_role, student_no, program, year_level, section, id_number)
  ON public.profiles FROM authenticated;
GRANT UPDATE ON public.profiles TO authenticated;
GRANT INSERT ON public.profiles TO authenticated;

-- ═════════════════════════════════════════════════════════════════════
-- 5. Drop the admin write paths and helpers
-- ═════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.set_user_role(UUID, TEXT);
DROP FUNCTION IF EXISTS public.set_user_approval(UUID, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.set_user_active(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.current_approved_role();
DROP FUNCTION IF EXISTS public.imcc_role_hint(TEXT);
DROP FUNCTION IF EXISTS public.imcc_is_named_email(TEXT);
DROP FUNCTION IF EXISTS public.imcc_is_student_email(TEXT);

-- ═════════════════════════════════════════════════════════════════════
-- 6. Restore the original role vocabulary
-- ═════════════════════════════════════════════════════════════════════
-- Any account still sitting on the 'pending' sentinel must be resolved
-- first, or the constraint below will reject the migration.
SELECT role, status, count(*)
  FROM public.profiles
 WHERE role = 'pending'
 GROUP BY role, status;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('student','faculty','teacher','staff','admin','dean'));

-- Columns added by the migration are intentionally left in place:
-- dropping them would destroy user data. They are harmless once the
-- constraint is back to the original vocabulary.
