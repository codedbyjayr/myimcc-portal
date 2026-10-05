-- =====================================================================
-- MyIMCC Portal -- FAQ content corrections
--
-- The seeded FAQ articles drifted away from the portal's actual
-- behaviour, and one of them taught students to use a payment flow that
-- does not exist and must not exist.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. "Pay Now" / online payment claim
-- ─────────────────────────────────────────────────────────────────────
-- Three places assert that a student can settle an installment from the
-- portal by clicking Pay Now:
--
--   supabase-schema.sql:359            portal_config FAQ answer
--   supabase-schema-v3-rag.sql:69      faq_articles 'Can I pay in installments?'
--   supabase/functions/faq-assistant/index.ts:13   (removed; now grounded)
--
-- The student dashboard's "Pay Now" button was a direct UPDATE against
-- the installments table, permitted by the RLS policy
-- "Students update own installments". It was not a payment gateway. A
-- student could mark their own tuition paid, and a zero balance then
-- cleared the cashier's hold on clearance. The button and the policy are
-- removed; the content must match.
--
-- The seed in supabase-schema-v3-rag.sql also used ON CONFLICT DO NOTHING
-- without a unique constraint, so re-running it duplicates every row
-- rather than being idempotent. These UPDATEs are the idempotent form.

UPDATE faq_articles
   SET answer = 'Tuition is settled through the Cashier''s Office or your designated '
             || 'payment channel. Open Billing & History to see your assessed balance and '
             || 'any installment schedule the Cashier''s Office has issued. Payment status is '
             || 'recorded by cashier staff, so it will not change until they process it. '
             || 'If no schedule is shown, no schedule has been published yet and your full '
             || 'assessed balance is due.'
 WHERE question = 'Can I pay in installments?';

UPDATE faq_articles
   SET answer = 'Go to Billing & History to view your assessed balance, your published '
             || 'installment schedule, and your transaction history. Payment status is '
             || 'recorded by Cashier staff; there is no online payment button in the portal.'
 WHERE answer ILIKE '%Pay Now%';

-- ─────────────────────────────────────────────────────────────────────
-- 2. "Pay any balance" advice in the clearance answer
-- ─────────────────────────────────────────────────────────────────────
-- Reinforces the correct flow: Cashier records the payment, then the
-- department can clear.
UPDATE faq_articles
   SET answer = 'To get library clearance, return all borrowed books and settle any library '
             || 'fines with the Library. Once your account is clear, the librarian signs your '
             || 'clearance. If books or fines are outstanding, Library clearance will show '
             || 'Action Required.'
 WHERE question = 'How do I get cleared by the library?';

-- ─────────────────────────────────────────────────────────────────────
-- 3. Scheduling claim
-- ─────────────────────────────────────────────────────────────────────
-- This used to be corrected to "a class schedule view is not available in the
-- portal yet", which was true when written and stopped being true once the
-- Class Schedule page shipped. Correcting drift by asserting the opposite
-- extreme just moves the lie, so the answer now describes the page that
-- actually exists: real published meeting times, and an explicit note naming
-- the Registrar for any enrolled subject with no time published yet.
UPDATE faq_articles
   SET answer = 'Open the Class Schedule page in the sidebar. It lists your enrolled subjects '
             || 'with meeting day, time, room and instructor, and the class you are sitting in '
             || 'right now is highlighted. All times are Manila time. If a subject you are '
             || 'enrolled in has no meeting time published yet, the page says so and names the '
             || 'Registrar to confirm with, rather than showing an invented time.'
 WHERE question = 'How do I view my class schedule?';

-- ─────────────────────────────────────────────────────────────────────
-- 4. Email and sign-in claim
-- ─────────────────────────────────────────────────────────────────────
-- "Any valid Google account can sign in" is wrong after the identity
-- hardening: sign-in is restricted to the institutional domain, and a
-- role is only ever granted through an approved profile.
UPDATE faq_articles
   SET answer = 'Sign in with the official @imcc.edu.ph address issued to you by the '
             || 'institution. Access is granted by the administration: your student account '
             || 'is confirmed automatically from your institutional email, while faculty, '
             || 'staff and administrative accounts are approved manually before access is '
             || 'granted.'
 WHERE question = 'What email do I use to log in?';

-- ─────────────────────────────────────────────────────────────────────
-- 5. Report duplicates left by the non-idempotent seed
-- ─────────────────────────────────────────────────────────────────────
SELECT 'duplicate faq_articles (re-run of v3 seed)' AS report,
       question,
       COUNT(*) AS copies,
       MIN(created_at) AS oldest,
       MAX(created_at) AS newest
  FROM faq_articles
 GROUP BY question
HAVING COUNT(*) > 1
 ORDER BY copies DESC, question;

-- Keep the oldest copy of each question, then remove the rest:
--
-- DELETE FROM faq_articles a
--  USING faq_articles b
--   WHERE a.question = b.question
--     AND a.created_at > b.created_at;
