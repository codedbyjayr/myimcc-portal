-- =====================================================================
-- MyIMCC Portal — Phase 0b Security Hardening (Clearances)
-- Run AFTER security-hardening-phase0a.sql.
-- See security-hardening-phase0b-rollback.sql to revert.
-- =====================================================================
--
-- Fixes a self-service clearance hole.
--
-- fix-grade-permissions-and-revert.sql:236 granted:
--
--   CREATE POLICY "Clearance manage policy"
--     ON public.clearances FOR ALL TO authenticated
--     USING (student_id = auth.uid() OR <is staff>)
--
-- FOR ALL with `student_id = auth.uid()` gives every student INSERT,
-- UPDATE and DELETE on their own clearance rows. A student could run:
--
--   UPDATE clearances SET status = 'cleared', cleared_at = now()
--    WHERE student_id = auth.uid();
--
-- and mark themselves cleared at every department without touching the
-- interface. The student dashboard also shipped a button labelled
-- "Toggle Admin View to simulate faculty approval" that exposed the same
-- capability through the UI; that button is removed in Phase 0b.
--
-- After this migration students may READ their own clearance rows and
-- nothing more. Writes require a verified staff-class role.

-- ═════════════════════════════════════════════════════════════════════
-- 1. Students may read their own clearance; nobody self-writes
-- ═════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Clearance manage policy" ON public.clearances;
DROP POLICY IF EXISTS "Students read own clearance" ON public.clearances;
DROP POLICY IF EXISTS "Staff manage clearances" ON public.clearances;
-- The two role-only policies from supabase-schema.sql are dropped here too.
-- They are not merely redundant: RLS policies are permissive and OR together,
-- so while either one survived it kept UPDATE and SELECT open to any account
-- carrying role='staff', including one still on 'pending' or one suspended.
-- Recreated below with status and is_active included, so the trigger is a
-- second line of defence rather than the only thing standing in the way.
DROP POLICY IF EXISTS "Staff update clearances" ON public.clearances;
DROP POLICY IF EXISTS "Staff read all clearances" ON public.clearances;

CREATE POLICY "Students read own clearance" ON public.clearances
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()));

-- Staff-class roles manage clearance. `status = 'approved'` matters:
-- a pending account must not be able to clear anybody, including itself.
CREATE POLICY "Staff manage clearances" ON public.clearances
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = (SELECT auth.uid())
         AND p.status = 'approved'
         AND p.is_active IS NOT FALSE
         AND p.role IN ('faculty','teacher','staff','dean','registrar','admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = (SELECT auth.uid())
         AND p.status = 'approved'
         AND p.is_active IS NOT FALSE
         AND p.role IN ('faculty','teacher','staff','dean','registrar','admin')
    )
  );

-- ═════════════════════════════════════════════════════════════════════
-- 2. clearance_status ledger: staff-only, as intended
-- ═════════════════════════════════════════════════════════════════════
-- The existing policy omitted the approval and active checks.
--
-- Guarded, because no migration in this repository ever created a
-- public.clearance_status table: the clearance ledger is public.clearances
-- (supabase-schema.sql), which section 1 above has already secured, and
-- public.clearance_departments (v2). Applied unguarded, this file simply
-- failed with 'relation public.clearance_status does not exist' and took the
-- rest of the migration with it, so a fresh database never got the clearance
-- trigger or the message-content fixes further down.
--
-- The guard exists rather than deleting the block because a live database may
-- predate the rename and still carry the table. Where it exists it is still
-- tightened; where it does not, the section is skipped. Verify with:
--   SELECT to_regclass('public.clearance_status');
DO $$
BEGIN
  IF to_regclass('public.clearance_status') IS NOT NULL THEN
    EXECUTE $inner$
      DROP POLICY IF EXISTS "Staff faculty dean admin manage clearance_status"
        ON public.clearance_status;
      CREATE POLICY "Staff faculty dean admin manage clearance_status"
        ON public.clearance_status FOR ALL TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.profiles p
             WHERE p.id = (SELECT auth.uid())
               AND p.status = 'approved'
               AND p.is_active IS NOT FALSE
               AND p.role IN ('faculty','teacher','staff','dean','registrar','admin')
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.profiles p
             WHERE p.id = (SELECT auth.uid())
               AND p.status = 'approved'
               AND p.is_active IS NOT FALSE
               AND p.role IN ('faculty','teacher','staff','dean','registrar','admin')
          )
        );
    $inner$;

    RAISE NOTICE 'tightened policy on public.clearance_status';
  ELSE
    RAISE NOTICE
      'public.clearance_status does not exist, skipping. The clearance ledger is public.clearances, secured in section 1.';
  END IF;
END;
$$;

-- ═════════════════════════════════════════════════════════════════════
-- 3. Column guard: cleared_at is set by staff, never by the student
-- ═════════════════════════════════════════════════════════════════════
-- Defence in depth. Even if a future policy change re-opens UPDATE for
-- students, this refuses a write that marks a clearance cleared without
-- a staff identity.
CREATE OR REPLACE FUNCTION public.clearances_protect_cleared()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = auth.uid()
       AND p.status = 'approved'
       AND p.is_active IS NOT FALSE
       AND p.role IN ('faculty','teacher','staff','dean','registrar','admin')
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.cleared_at IS DISTINCT FROM OLD.cleared_at
     OR NEW.officer_name IS DISTINCT FROM OLD.officer_name
  THEN
    RAISE EXCEPTION
      'clearance status can only be changed by registrar or department staff'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_clearances_protect_cleared ON public.clearances;
CREATE TRIGGER trg_clearances_protect_cleared
  BEFORE UPDATE ON public.clearances
  FOR EACH ROW EXECUTE FUNCTION public.clearances_protect_cleared();

-- ═════════════════════════════════════════════════════════════════════
-- 4. Installments and transactions: read-only for students
-- ═════════════════════════════════════════════════════════════════════
-- The same defect, with larger consequences. supabase-schema.sql:286
-- granted:
--
--   CREATE POLICY "Students update own installments" ON installments
--     FOR UPDATE USING (student_id = auth.uid());
--
-- The student dashboard's "Pay Now" button wrote straight to this
-- policy. It was not a payment flow, it was a self-service UPDATE, so a
-- student could run:
--
--   UPDATE installments SET status = 'paid', paid_at = now()
--    WHERE student_id = auth.uid();
--
-- and settle their entire tuition. Combined with the clearance hole
-- above this defeated the financial controls end to end: zero balance,
-- so the cashier has nothing to collect, so the clearance clears.
--
-- Students keep read access to their own figures. Recording a payment is
-- a cashier action and now requires a verified staff-class role.
DROP POLICY IF EXISTS "Students update own installments" ON public.installments;
DROP POLICY IF EXISTS "Students read own installments" ON public.installments;
DROP POLICY IF EXISTS "Staff manage installments" ON public.installments;

CREATE POLICY "Students read own installments" ON public.installments
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()));

CREATE POLICY "Staff manage installments" ON public.installments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = (SELECT auth.uid())
         AND p.status = 'approved'
         AND p.is_active IS NOT FALSE
         AND p.role IN ('faculty','teacher','staff','dean','registrar','admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = (SELECT auth.uid())
         AND p.status = 'approved'
         AND p.is_active IS NOT FALSE
         AND p.role IN ('faculty','teacher','staff','dean','registrar','admin')
    )
  );

-- Transactions are the cashier's record of what was actually collected.
-- A student must not be able to insert or edit one.
DROP POLICY IF EXISTS "Students write own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Students read own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Staff manage transactions" ON public.transactions;

CREATE POLICY "Students read own transactions" ON public.transactions
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()));

CREATE POLICY "Staff manage transactions" ON public.transactions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = (SELECT auth.uid())
         AND p.status = 'approved'
         AND p.is_active IS NOT FALSE
         AND p.role IN ('faculty','teacher','staff','dean','registrar','admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = (SELECT auth.uid())
         AND p.status = 'approved'
         AND p.is_active IS NOT FALSE
         AND p.role IN ('faculty','teacher','staff','dean','registrar','admin')
    )
  );

-- ═════════════════════════════════════════════════════════════════════
-- 5. Column guard: settled billing state is staff-managed
-- ═════════════════════════════════════════════════════════════════════
-- Defence in depth for installments, mirroring the clearance guard.
CREATE OR REPLACE FUNCTION public.installments_protect_settlement()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = auth.uid()
       AND p.status = 'approved'
       AND p.is_active IS NOT FALSE
       AND p.role IN ('faculty','teacher','staff','dean','registrar','admin')
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.or_number IS DISTINCT FROM OLD.or_number
  THEN
    RAISE EXCEPTION
      'installment amounts and payment status are cashier-managed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_installments_protect_settlement ON public.installments;
CREATE TRIGGER trg_installments_protect_settlement
  BEFORE UPDATE ON public.installments
  FOR EACH ROW EXECUTE FUNCTION public.installments_protect_settlement();

-- ═════════════════════════════════════════════════════════════════════
-- 6. Repair any rows a student already self-settled
-- ═════════════════════════════════════════════════════════════════════
-- A payment with no matching transaction is not a real collection.
SELECT 'self-settled installments to review' AS report,
       student_id,
       name,
       amount,
       status,
       paid_at,
       or_number
  FROM public.installments
 WHERE status = 'paid'
   AND (paid_at IS NULL OR or_number IS NULL);

-- Uncomment to reset payments that have no official receipt:
-- UPDATE public.installments
--    SET status = 'pending', paid_at = NULL, or_number = NULL
--  WHERE status = 'paid' AND (paid_at IS NULL OR or_number IS NULL);

-- ═════════════════════════════════════════════════════════════════════
-- 7. Repair any rows a student already self-cleared
-- ═════════════════════════════════════════════════════════════════════
SELECT 'self-cleared rows to review' AS report,
       student_id,
       department_code,
       status,
       cleared_at
  FROM public.clearances
 WHERE status = 'cleared'
   AND cleared_at IS NOT NULL
   AND officer_name IS NULL;

-- Uncomment to reset every unattributed clearance back to pending:
-- UPDATE public.clearances
--    SET status = 'pending', cleared_at = NULL
--  WHERE status = 'cleared' AND officer_name IS NULL;

-- =====================================================================
-- 8. Messages: a recipient may only mark as read, never rewrite
-- =====================================================================
-- supabase-schema-v2.sql:192 granted:
--
--   CREATE POLICY "Users update own messages" ON messages
--     FOR UPDATE USING (recipient_id = auth.uid());
--
-- A policy with only USING constrains which rows you may touch, not what
-- you may write to them. The recipient of a message could therefore
-- rewrite sender_id, recipient_id, subject and body on any message sent
-- to them. For a registrar notice that means a student could edit an
-- official instruction from the Registrar's Office into whatever they
-- liked, and it would render as sent by staff.
--
-- Read state is the only thing a recipient legitimately changes, so the
-- column grant is narrowed to exactly that.

REVOKE UPDATE ON public.messages FROM authenticated;
GRANT UPDATE (is_read, read_at) ON public.messages TO authenticated;

-- Defence in depth, mirroring the clearance and installment guards.
CREATE OR REPLACE FUNCTION public.messages_protect_content()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = auth.uid()
       AND p.status = 'approved'
       AND p.is_active IS NOT FALSE
       AND p.role IN ('faculty','teacher','staff','dean','registrar','admin')
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.sender_id    IS DISTINCT FROM OLD.sender_id
     OR NEW.recipient_id IS DISTINCT FROM OLD.recipient_id
     OR NEW.subject    IS DISTINCT FROM OLD.subject
     OR NEW.body       IS DISTINCT FROM OLD.body
  THEN
    RAISE EXCEPTION
      'message content cannot be modified; only read state can be changed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_messages_protect_content ON public.messages;
CREATE TRIGGER trg_messages_protect_content
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_protect_content();

-- Report anything that looks tampered with, for manual review. There is
-- no way to prove tampering from the row alone, so this is informational.
SELECT 'messages to review' AS report,
       id,
       sender_id,
       recipient_id,
       subject,
       created_at
  FROM public.messages
 WHERE read_at IS NOT NULL
   AND is_read IS FALSE;
