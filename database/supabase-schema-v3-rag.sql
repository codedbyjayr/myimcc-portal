-- =====================================================================
-- MyIMCC Portal — RAG / pgvector Schema Extension (v3)
-- FREE VERSION — Uses 384-dim embeddings (HuggingFace/Xenova)
-- No OpenAI API key required — embeddings generated inside Edge Function
-- =====================================================================

-- ── Enable pgvector extension ────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

-- ── Add embedding column to faq_articles (384 dims for MiniLM) ──────
ALTER TABLE faq_articles ADD COLUMN IF NOT EXISTS embedding vector(384);

-- ── Create HNSW index for fast similarity search ─────────────────────
CREATE INDEX IF NOT EXISTS faq_articles_embedding_idx
  ON faq_articles USING hnsw (embedding vector_ip_ops)
  WITH (m = 16, ef_construction = 64);

-- ── Function: match_faq_articles ─────────────────────────────────────
-- Semantic similarity search using cosine distance
CREATE OR REPLACE FUNCTION match_faq_articles(
  query_embedding vector(384),
  match_count INT DEFAULT 5,
  match_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  id UUID,
  category TEXT,
  question TEXT,
  answer TEXT,
  keywords TEXT,
  similarity FLOAT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    f.id,
    f.category,
    f.question,
    f.answer,
    f.keywords,
    1 - (f.embedding <=> query_embedding) AS similarity
  FROM faq_articles f
  WHERE f.is_active = true
    AND f.embedding IS NOT NULL
    AND 1 - (f.embedding <=> query_embedding) > match_threshold
  ORDER BY f.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ── Grant execute permissions ────────────────────────────────────────
GRANT EXECUTE ON FUNCTION match_faq_articles TO authenticated;

-- ── Seed: Expanded FAQ articles for better RAG coverage ─────────────
INSERT INTO faq_articles (category, question, answer, keywords) VALUES
  ('Enrollment', 'What is the enrollment process step by step?',
   'The enrollment process has 3 steps: 1) Course Selection — browse available courses for your program and year level, check the boxes for subjects you want to enroll in. 2) Fee Review — review your tuition and miscellaneous fees in the billing summary on the right side of the screen. Click Proceed to Fee Review. 3) Confirmation — confirm your enrollment. You will see a success message and your Certificate of Registration will be generated automatically.',
   'enroll, process, steps, how to, register, subjects, courses, select, confirm'),
  ('Enrollment', 'When does enrollment start and end?',
   'Enrollment dates are announced by the Registrar. You can check the banner at the top of your dashboard for the current enrollment period deadline. Late enrollment may be allowed but will incur late fees.',
   'enrollment, start, end, deadline, when, dates, period, late'),
  ('Enrollment', 'How many units should I enroll in?',
   'A typical full-time load is 18-21 units per semester. The minimum full-time load is 15 units. You cannot exceed 24 units without approval from your Program Chair. Check your curriculum in the Prospectus view under Grades & Evaluation for required subjects.',
   'units, how many, load, full-time, minimum, maximum, credits, overload'),
  ('Billing', 'How much is the tuition per unit?',
   'Tuition varies by program. IT and Computer Science courses typically cost ₱1,200-₱1,500 per unit. General education subjects are ₱1,000-₱1,200 per unit. Check the course offerings list during enrollment for exact fees per subject.',
   'tuition, per unit, cost, price, how much, fee, expensive'),
  ('Billing', 'Can I pay in installments?',
   'Tuition is settled through the Cashier''s Office or your designated payment channel. Open Billing & History to see your assessed balance and any installment schedule the Cashier''s Office has issued. Payment status is recorded by cashier staff, so it will not change until they process it. If no schedule is shown, no schedule has been published yet and your full assessed balance is due.',
   'installment, payment plan, partial, divide, schedule, pay, terms'),
  ('Grades', 'How is the GWA computed?',
   'The General Weighted Average (GWA) is computed by multiplying each subject''s final grade by its unit value, summing these products, then dividing by the total number of units. Lower GWA means better performance (1.0 is highest, 5.0 is failing). Dean''s List requires GWA of 1.75 or better.',
   'gwa, computation, average, weighted, compute, calculate, deans list, honor'),
  ('Grades', 'What is a passing grade?',
   'A passing grade is 3.0 or below (on a 1.0-5.0 scale where 1.0 is highest). Grades above 3.0 are failing. A grade of 3.0 is the lowest passing grade. Incomplete (INC) grades must be completed within one year or they become failing grades.',
   'passing, grade, 3.0, failing, 5.0, inc, incomplete, lowest, highest'),
  ('Clearance', 'What departments need to clear me?',
   'The standard clearance departments are: Registrar, Cashier/Finance, Library, Guidance, Dean''s Office, and Department Head. Each department must digitally sign your clearance before you can enroll for the next semester. Check the Online Clearance page for your current status.',
   'clearance, departments, who, which, registrar, cashier, library, guidance, dean'),
  ('Clearance', 'How do I get cleared by the library?',
   'To get library clearance, ensure all borrowed books are returned and any library fines are paid. Once your account is clear, the librarian will digitally sign your clearance. If you have outstanding books or fines, the library clearance will show Action Required.',
   'library, clearance, books, return, fines, clear, borrowed, overdue'),
  ('General', 'How do I reset my 2FA / authenticator?',
   'If you lost your phone or deleted Google Authenticator, use the "Lost or deleted Authenticator code?" link on the login page and re-scan a new QR code. If you cannot get back into your account at all, raise a consultation request through the Help page or contact the IT office through the Registrar.',
   '2fa, reset, authenticator, lost, deleted, new phone, qr, rescan, mfa, totp'),
  ('General', 'What email do I use to log in?',
   'Sign in with the official @imcc.edu.ph address issued to you by the institution. Access is granted by the administration: your student account is confirmed automatically from your institutional email, while faculty, staff and administrative accounts are approved manually before access is granted.',
   'email, login, log in, sign in, institutional, school, domain, which, what'),
  ('General', 'Can I access the LMS and Career Hub from this portal?',
   'Yes, the portal has SSO (Single Sign-On) links to the LMS and Career Hub in the sidebar under Quick Links. Click the LMS link to access your courses, assignments, and grades. Click Career Hub to view job postings and career resources. You will be automatically logged in via SSO.',
   'lms, career hub, sso, link, access, navigate, portal, single sign on'),
  ('General', 'How do I view my class schedule?',
   'Open the Class Schedule page in the sidebar. It lists your enrolled subjects with meeting day, time, room and instructor, and the class you are sitting in right now is highlighted. All times are Manila time. If a subject you are enrolled in has no meeting time published yet, the page says so and names the Registrar to confirm with, rather than showing an invented time.',
   'schedule, timetable, class, when, where, room, time, view'),
  ('General', 'How do I contact support?',
   'Use the Help page in the sidebar first: it answers from published articles and, if your question is not covered, lets you raise a consultation request that a school office replies to in Messages. For account or sign-in problems, contact the IT office through the Registrar. Ask the Registrar about enrollment, grades and records, and the Cashier''s Office about billing.',
   'contact, support, help, email, call, phone, registrar, finance, it, technical')
ON CONFLICT DO NOTHING;
