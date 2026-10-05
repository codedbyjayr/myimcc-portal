-- =====================================================================
-- MyIMCC Portal -- local test harness bootstrap
--
-- The migration and test scripts are written for Supabase, so running them
-- locally needs the small part of Supabase's surface they actually touch:
-- the auth schema, auth.uid(), and the three API roles whose RLS policies
-- the migrations are written against.
--
-- This exists so the test scripts can be executed against a throwaway
-- database before anything is applied to the real one. Without it the only
-- way to find out whether a migration is valid is to run it in production.
--
-- This is NOT a Supabase replacement. It deliberately stubs the minimum:
-- no JWT verification, no GoTrue, no storage, no realtime. auth.users here
-- is a plain table, which is enough for the AFTER INSERT trigger that
-- creates a profile row.
--
-- Usage:
--   docker run -d --name imcc-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16-alpine
--   docker exec -i imcc-pg psql -U postgres -d imcc -f - < test-harness-setup.sql
--   ... then apply the migrations in order, then the test scripts ...
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. Extensions the schema depends on
-- ─────────────────────────────────────────────────────────────────────
-- gen_random_uuid comes from pgcrypto; uuid_generate_v4 from uuid-ossp.
-- Both are used in column defaults, so they must exist before any table is
-- created rather than being added afterwards. The extension name is
-- double-quoted because it contains a hyphen, which is an identifier
-- character only when quoted.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────────
-- 2. The API roles
-- ─────────────────────────────────────────────────────────────────────
-- The RLS policies name these roles explicitly ("TO authenticated"), and
-- the test scripts do SET LOCAL ROLE authenticated, so both the role and the
-- GRANTs have to exist for a policy assertion to mean anything.
--
-- NOLOGIN because nothing connects as them; the session switches to them.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. The auth schema
-- ─────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;

-- auth.uid() is the single most-used function in the whole schema: every
-- RLS policy identifies "who is calling" through it. It reads the same
-- request GUC that the test scripts set, which is why set_config on
-- request.jwt.claim.sub is enough to impersonate a user.
--
-- NULLIF on the empty string matters: reset_user() clears the GUC rather
-- than unsetting it, and ''::uuid would be a cast error instead of "no
-- user".
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- auth.role() is the other half of the pair GoTrue provides.
CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    current_setting('role', true)
  );
$$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role(), auth.jwt() TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 4. auth.users
-- ─────────────────────────────────────────────────────────────────────
-- Only the three columns the portal touches. On real Supabase this table is
-- owned by GoTrue and the portal must never write to it directly; here it
-- has to be insertable, because the test scripts create their fixtures by
-- inserting here and relying on the on_auth_user_created trigger to make
-- the matching profiles row.
CREATE TABLE IF NOT EXISTS auth.users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text UNIQUE,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON auth.users TO authenticated, service_role;

-- auth.mfa_factors holds Supabase Auth TOTP factors
CREATE TABLE IF NOT EXISTS auth.mfa_factors (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  factor_type text NOT NULL,
  status      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  secret      text
);

GRANT SELECT, INSERT, UPDATE, DELETE ON auth.mfa_factors TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 5. Default table privileges
-- ─────────────────────────────────────────────────────────────────────
-- supabase-schema.sql and -v2.sql create their tables without per-table
-- GRANTs, relying on Supabase's blanket default privileges for the
-- authenticated role. The test scripts assert against a real privilege
-- check, so this has to be reproduced here or those assertions would fail
-- for a reason that has nothing to do with the code under test.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO anon;
