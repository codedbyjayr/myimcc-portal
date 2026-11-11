BEGIN;

CREATE FUNCTION public.portal_frontend_release_ready() RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT CASE WHEN public.portal_release_ready() = 'semester-v3'
    -- The old school RPC has the same signature. Update this check if the validation message changes.
    AND (
      SELECT count(*) = 2
      FROM pg_catalog.pg_proc AS proc
      JOIN pg_catalog.pg_namespace AS ns ON ns.oid = proc.pronamespace
      WHERE ns.nspname IN ('private', 'imcc_review_private')
        AND proc.proname = 'publish_summer_offering'
        AND pg_catalog.oidvectortypes(proc.proargtypes) = 'integer, text, text'
        AND pg_catalog.strpos(proc.prosrc, 'School year must contain consecutive years') > 0
    )
    AND pg_catalog.has_function_privilege('authenticated',
      pg_catalog.to_regprocedure('public.publish_summer_offering(integer,text,text)'), 'EXECUTE')
    AND pg_catalog.has_function_privilege('authenticated', (
      SELECT proc.oid
      FROM pg_catalog.pg_proc AS proc
      JOIN pg_catalog.pg_namespace AS ns ON ns.oid = proc.pronamespace
      WHERE ns.nspname = 'imcc_review' AND proc.proname = 'publish_summer_offering'
        AND pg_catalog.oidvectortypes(proc.proargtypes) = 'integer, text, text'
    ), 'EXECUTE')
  THEN 'registrar-summer-v1' END;
$$;

REVOKE ALL ON FUNCTION public.portal_frontend_release_ready() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_frontend_release_ready() TO anon, authenticated;

COMMIT;
