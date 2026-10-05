-- =====================================================================
-- MyIMCC Portal — Phase 0b Rollback (Clearances)
-- Reverts security-hardening-phase0b.sql ONLY.
-- =====================================================================
--
-- ⚠️  Restores the self-service clearance hole: students regain UPDATE
--     and DELETE on their own clearance rows and can mark themselves
--     cleared at every department. Re-run security-hardening-phase0b.sql
--     as soon as possible after rolling back.

-- ═════════════════════════════════════════════════════════════════════
-- 1. Drop the column guards
-- ═════════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS trg_clearances_protect_cleared ON public.clearances;
DROP FUNCTION IF EXISTS public.clearances_protect_cleared();

DROP TRIGGER IF EXISTS trg_installments_protect_settlement ON public.installments;
DROP FUNCTION IF EXISTS public.installments_protect_settlement();

-- ═════════════════════════════════════════════════════════════════════
-- 2. Restore the original permissive clearance policy
-- ═════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Staff manage clearances" ON public.clearances;
DROP POLICY IF EXISTS "Students read own clearance" ON public.clearances;

CREATE POLICY "Clearance manage policy"
  ON public.clearances FOR ALL TO authenticated
  USING (
    (student_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role IN ('teacher', 'faculty', 'staff', 'registrar', 'dean', 'admin')
    )
  );

-- ═════════════════════════════════════════════════════════════════════
-- 3. Restore the original clearance_status policy
-- ═════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Staff faculty dean admin manage clearance_status"
  ON public.clearance_status;
CREATE POLICY "Staff faculty dean admin manage clearance_status"
  ON public.clearance_status FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role IN ('teacher', 'faculty', 'staff', 'registrar', 'dean', 'admin')
    )
  );

-- ═════════════════════════════════════════════════════════════════════
-- 4. Restore the original student-writable installment policy
-- ═════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Staff manage installments" ON public.installments;

CREATE POLICY "Students update own installments" ON public.installments
  FOR UPDATE USING (student_id = auth.uid());

-- ═════════════════════════════════════════════════════════════════════
-- 5. Restore student-writable transactions
-- ═════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Staff manage transactions" ON public.transactions;

CREATE POLICY "Students write own transactions" ON public.transactions
  FOR ALL USING (student_id = auth.uid());

-- =====================================================================
-- 6. Restore the original unrestricted message UPDATE
-- =====================================================================
DROP TRIGGER IF EXISTS trg_messages_protect_content ON public.messages;
DROP FUNCTION IF EXISTS public.messages_protect_content();

REVOKE UPDATE (is_read, read_at) ON public.messages FROM authenticated;
GRANT UPDATE ON public.messages TO authenticated;
