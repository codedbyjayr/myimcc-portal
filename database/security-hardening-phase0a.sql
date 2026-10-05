-- =====================================================================
-- MyIMCC Portal — Phase 0a Security Hardening
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Idempotent. See security-hardening-phase0a-rollback.sql to revert.
-- =====================================================================
--
-- Fixes three privilege-escalation defects:
--
--   1. "Users update own profile" has no WITH CHECK, so any authenticated
--      user can set their own role/status to 'admin'.
--   2. handle_new_user() assigns roles from email domain suffixes and
--      falls through to 'student' for every unmatched address, so any
--      random email is auto-created with student access, and a dean or
--      registrar on plain @imcc.edu.ph is auto-created as 'staff'.
--   3. Unapproved users default to role='student', which satisfies the
--      student-facing RLS policies, so the approval queue is decorative.
--
-- Design notes
-- ------------
-- * Role and status are admin-managed columns. Users cannot write them.
-- * 'pending' is added to the role vocabulary as a sentinel that matches
--   none of the existing `role IN ('faculty','dean','admin',...)` policies,
--   so unapproved accounts get zero data access without rewriting every
--   policy in the schema.
-- * Every signup starts on role='pending'/status='onboarding'. role='pending'
--   matches no policy in the schema, so a new account has zero data access.
--   status='onboarding' is what routes the user to the role picker; a
--   'pending' status here would send a brand-new signup to the waiting room
--   before it had chosen a role, stranding it with no way to get in.
--   Auto-approval then happens on the onboarding UPDATE, where requested_role
--   is known, and grants 'student' ONLY. 'student' is the lowest-privilege
--   role, so a pattern misfire degrades to "a teacher sees the student
--   portal", never "a student sees the admin portal". Never auto-approve a
--   faculty/staff/dean/registrar/admin role.
-- * student_no UNIQUE is intentionally KEPT: there is no foreign key to
--   profiles.student_no anywhere in the schema, so it does not block
--   inserts, and it prevents two accounts claiming one student number.

-- ═════════════════════════════════════════════════════════════════════
-- 1. Extend the role vocabulary
-- ═════════════════════════════════════════════════════════════════════
-- Drop whichever spelling of the role CHECK constraint exists.
DO $$
DECLARE cname TEXT;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
   WHERE conrelid = 'public.profiles'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%role%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('pending','student','faculty','teacher','staff','dean','registrar','admin'));

-- status may be missing on a v1-only database.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS requested_role TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS id_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Every pre-existing row is trusted, not re-derived from its email.
UPDATE public.profiles SET status = 'approved' WHERE status IS NULL;

-- ═════════════════════════════════════════════════════════════════════
-- 2. Email pattern helpers
-- ═════════════════════════════════════════════════════════════════════
-- [a-z]{3}[0-9]{5}  -> student (institutional)
-- anything else      -> not a student; requires manual approval
-- These are HINTS. They never grant a role other than 'student'.
CREATE OR REPLACE FUNCTION public.imcc_is_student_email(addr TEXT)
RETURNS BOOLEAN AS $$
  SELECT lower(split_part(addr, '@', 1)) ~ '^[a-z]{3}[0-9]{5}$';
$$ LANGUAGE sql IMMUTABLE;

-- Firstname.lastname -> likely faculty or staff, still only a hint.
CREATE OR REPLACE FUNCTION public.imcc_is_named_email(addr TEXT)
RETURNS BOOLEAN AS $$
  SELECT lower(split_part(addr, '@', 1)) ~ '^[a-z]+\.[a-z]+$';
$$ LANGUAGE sql IMMUTABLE;

-- Returns 'student' | 'faculty_or_staff' | 'unknown'.
-- 'faculty_or_staff' is a prefill suggestion only, never a grant.
CREATE OR REPLACE FUNCTION public.imcc_role_hint(addr TEXT)
RETURNS TEXT AS $$
  SELECT CASE
    WHEN public.imcc_is_student_email(addr) THEN 'student'
    WHEN public.imcc_is_named_email(addr)  THEN 'faculty_or_staff'
    ELSE 'unknown'
  END;
$$ LANGUAGE sql IMMUTABLE;

-- ═════════════════════════════════════════════════════════════════════
-- 3. Replace handle_new_user: no role assignment from email
-- ═════════════════════════════════════════════════════════════════════
-- Every signup lands on the 'pending' sentinel with no data access.
-- Approval is decided in section 4, on the onboarding UPDATE.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, status, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
             split_part(NEW.email, '@', 1)),
    'pending',
    'onboarding',
    false
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═════════════════════════════════════════════════════════════════════
-- 4. Pin the admin-managed columns, and auto-approve students on onboarding
-- ═════════════════════════════════════════════════════════════════════
-- These columns may only be changed by a caller acting as an admin,
-- which the SECURITY DEFINER functions below enforce explicitly.
-- SECURITY DEFINER bypasses RLS, so the check must live in the body.
CREATE OR REPLACE FUNCTION public.profiles_protect_privileged()
RETURNS TRIGGER AS $$
DECLARE
  v_caller_is_admin BOOLEAN := false;
  v_is_student_pat  BOOLEAN;
  v_grant           BOOLEAN := false;
BEGIN
  -- Bootstrap escape hatch for promoting the very first admin.
  --
  -- Every check below needs an already-approved admin to act on behalf of, so
  -- on a fresh project there was no way to create the first one: staff signups
  -- sit on 'pending', promoting them requires an admin, and no admin can
  -- exist. That left Help, Messages, Appointments and the rosters permanently
  -- unreachable. Running one statement from the Supabase SQL editor to
  -- promote the first admin closes the loop; every later change goes through
  -- the ordinary admin path.
  --
  -- session_user is the discriminator, and it has to be. current_user is
  -- useless here because this function is SECURITY DEFINER, so current_user is
  -- always the function owner and this test would match unconditionally and
  -- switch the guard off. session_user is the login role: 'postgres' for the
  -- SQL editor and direct connections, 'authenticator' for everything arriving
  -- through PostgREST, so API traffic is unaffected.
  --
  -- This returns early rather than only relaxing the field guards below, and
  -- that is load-bearing. set_user_approval() clears requested_role by setting
  -- it to NULL, which the onboarding branch below would otherwise read as "no
  -- role chosen" and answer by forcing the row back to role='pending',
  -- status='pending', is_active=false. Gating just the guards on trust let
  -- every approval silently undo itself, so an administrator could never
  -- approve a faculty or staff account at all. The onboarding branch is a
  -- state machine for self-service signups; it has no business overriding an
  -- administrator's decision.
  IF session_user = 'postgres' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = auth.uid()
       AND p.role = 'admin'
       AND p.status = 'approved'
       AND p.is_active IS NOT FALSE
  ) INTO v_caller_is_admin;

  -- Re-entrant call from a SECURITY DEFINER admin function: the admin
  -- check above already passed, so allow the write through.
  IF v_caller_is_admin THEN
    RETURN NEW;
  END IF;

  -- requested_role and full_name are the two fields a pending user is
  -- allowed to write. requested_role is how onboarding states intent, and
  -- full_name lets a user give their real name instead of the email local
  -- part the signup trigger fell back to. Neither grants access on its own:
  -- the role, status and is_active values that actually decide access are
  -- set below by this function, not by the request.
  --
  -- Both must be excluded from the tuple check for that reason. Listing
  -- full_name there made the onboarding name field unusable, and listing
  -- requested_role there made the auto-approval branch below unreachable,
  -- because the check raised first on every NULL -> 'student' transition.
  -- Once the account is approved or rejected both are frozen, so an
  -- approved staff member cannot re-point their own identity.
  IF OLD.status NOT IN ('pending', 'onboarding')
     AND (NEW.requested_role, NEW.full_name)
         IS DISTINCT FROM (OLD.requested_role, OLD.full_name)
  THEN
    RAISE EXCEPTION
      'requested_role and full_name can only be changed while your account is awaiting approval'
      USING ERRCODE = '42501';
  END IF;

  IF (NEW.role, NEW.status, NEW.is_active, NEW.email, NEW.deactivated_at)
     IS DISTINCT FROM
     (OLD.role, OLD.status, OLD.is_active, OLD.email, OLD.deactivated_at)
  THEN
    RAISE EXCEPTION
      'role, status, approval and identity fields are administrator-managed'
      USING ERRCODE = '42501';
  END IF;

  -- A self-editing user cannot promote themselves through the fields
  -- they are allowed to write, so the approval decision is ours.
  v_is_student_pat := public.imcc_is_student_email(OLD.email);

  -- 'onboarding' is the state handle_new_user() leaves a new signup in, so
  -- the user is routed to the role picker. This branch is what moves them
  -- to 'pending' (awaiting an administrator) or straight to 'approved'.
  IF OLD.status IN ('pending', 'onboarding')
     AND OLD.requested_role IS DISTINCT FROM NEW.requested_role
  THEN
    -- Students auto-approve, but only when the address matches the
    -- institutional student pattern. Everything else waits for an admin.
    IF NEW.requested_role = 'student' AND v_is_student_pat THEN
      NEW.role     := 'student';
      NEW.status   := 'approved';
      NEW.is_active := true;
      v_grant      := true;
    ELSE
      -- Keep the 'pending' sentinel: it grants no data access, which is
      -- what an unapproved account should have.
      NEW.role     := 'pending';
      NEW.status   := 'pending';
      NEW.is_active := false;
    END IF;
  END IF;

  -- Academic details are self-editable only by a student, or while the
  -- account is still awaiting approval. Locking a pending user out would
  -- block legitimate onboarding; locking an approved staff member prevents
  -- an account from being re-pointed at a student record.
  IF NOT v_grant
     AND OLD.status = 'approved'
     AND OLD.role <> 'student'
     AND (NEW.student_no, NEW.program, NEW.year_level, NEW.section, NEW.id_number)
         IS DISTINCT FROM
         (OLD.student_no, OLD.program, OLD.year_level, OLD.section, OLD.id_number)
  THEN
    RAISE EXCEPTION
      'academic details are locked after approval'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_profiles_protect_privileged ON public.profiles;
CREATE TRIGGER trg_profiles_protect_privileged
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_protect_privileged();

-- ═════════════════════════════════════════════════════════════════════
-- 5. Column-level grants
-- ═════════════════════════════════════════════════════════════════════
-- RLS policies do not bypass column-level GRANTs, so narrowing UPDATE
-- applies to admins too. Admin writes to privileged columns must go
-- through set_user_role() / set_user_approval() below.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (phone, address, avatar_url, requested_role, full_name,
              student_no, program, year_level, section, id_number, updated_at)
  ON public.profiles TO authenticated;

-- Also narrow INSERT: a user must not be able to forge an approved admin.
REVOKE INSERT ON public.profiles FROM authenticated;
GRANT INSERT (id, email, full_name, phone, address, avatar_url,
              requested_role, student_no, program, year_level, section, id_number)
  ON public.profiles TO authenticated;

-- ═════════════════════════════════════════════════════════════════════
-- 6. Give the existing self-update policy a WITH CHECK
-- ═════════════════════════════════════════════════════════════════════
-- USING constrains which rows may be touched; WITH CHECK constrains what
-- they may become. The original had only USING.
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ═════════════════════════════════════════════════════════════════════
-- 7. Admin write paths (SECURITY DEFINER)

-- Tighten public.is_admin(), defined in supabase-schema.sql.
--
-- The base version could only check role, because profiles had no status or
-- is_active column yet. It is the function the "Admins read all profiles" and
-- "Admins update profiles" policies call, so this is where a suspended or
-- still-pending admin stops counting as an admin. A pending account must not
-- be able to read or edit the whole user table, including itself.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = (SELECT auth.uid())
       AND role = 'admin'
       AND status = 'approved'
       AND is_active IS NOT FALSE
  );
$$;

-- Same tightening for the staff-class helper the clearance policies call.
-- It is defined role-only in supabase-schema.sql because status and is_active
-- do not exist yet at that point. Role alone is not enough: a signup carrying
-- role='staff' is still 'pending' until approved, and a suspended staff member
-- keeps the role, so either one satisfied the check.
CREATE OR REPLACE FUNCTION public.is_staff_class()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = (SELECT auth.uid())
       AND role IN ('faculty','teacher','staff','dean','registrar','admin')
       AND status = 'approved'
       AND is_active IS NOT FALSE
  );
$$;
-- ═════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_user_role(target_id UUID, new_role TEXT)
RETURNS VOID AS $$
DECLARE v_actor UUID := auth.uid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = v_actor AND role = 'admin' AND status = 'approved' AND is_active IS NOT FALSE
  ) THEN
    RAISE EXCEPTION 'administrator privileges required' USING ERRCODE = '42501';
  END IF;

  IF new_role NOT IN ('student','faculty','teacher','staff','dean','registrar','admin','pending') THEN
    RAISE EXCEPTION 'invalid role: %', new_role USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
     SET role = new_role,
         updated_at = now()
   WHERE id = target_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found: %', target_id USING ERRCODE = 'P0002';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Approve / reject. Rejecting parks the account on the 'pending'
-- sentinel and deactivates it, rather than leaving it on 'student'.
CREATE OR REPLACE FUNCTION public.set_user_approval(
  target_id UUID,
  approved BOOLEAN,
  approved_role TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_role  TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = v_actor AND role = 'admin' AND status = 'approved' AND is_active IS NOT FALSE
  ) THEN
    RAISE EXCEPTION 'administrator privileges required' USING ERRCODE = '42501';
  END IF;

  v_role := COALESCE(approved_role, 'student');

  IF NOT approved THEN
    v_role := 'pending';
  ELSIF v_role NOT IN ('student','faculty','teacher','staff','dean','registrar','admin') THEN
    RAISE EXCEPTION 'invalid approval role: %', v_role USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
     SET status      = CASE WHEN approved THEN 'approved' ELSE 'pending' END,
         role        = v_role,
         requested_role = NULL,
         is_active   = approved,
         deactivated_at = CASE WHEN approved THEN NULL ELSE now() END,
         updated_at  = now()
   WHERE id = target_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found: %', target_id USING ERRCODE = 'P0002';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Revoke / restore. Preserves role: a revoked admin must not stay 'admin'
-- (that would leave the account privileged but disabled), but a revoked
-- student or faculty member must keep their role for restoration.
CREATE OR REPLACE FUNCTION public.set_user_active(target_id UUID, active BOOLEAN)
RETURNS VOID AS $$
DECLARE
  v_actor   UUID := auth.uid();
  v_current TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = v_actor AND role = 'admin' AND status = 'approved' AND is_active IS NOT FALSE
  ) THEN
    RAISE EXCEPTION 'administrator privileges required' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_current FROM public.profiles WHERE id = target_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found: %', target_id USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.profiles
     SET is_active = active,
         deactivated_at = CASE WHEN active THEN NULL ELSE now() END,
         -- Revoking an admin demotes to student so no disabled account
         -- retains a privileged role.
         role = CASE WHEN NOT active AND v_current = 'admin'
                     THEN 'student' ELSE v_current END,
         updated_at = now()
   WHERE id = target_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═════════════════════════════════════════════════════════════════════
-- 8. Guardian: existing admin helpers must reject 'pending' accounts
-- ═════════════════════════════════════════════════════════════════════
-- Every policy in the schema gates on role alone. Since 'pending' matches
-- no role list, unapproved accounts are denied automatically. This
-- helper is for application code that needs the same guarantee.
CREATE OR REPLACE FUNCTION public.current_approved_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles
   WHERE id = auth.uid()
     AND status = 'approved'
     AND is_active IS NOT FALSE
     AND role <> 'pending';
$$ LANGUAGE sql STABLE SECURITY DEFINER;
