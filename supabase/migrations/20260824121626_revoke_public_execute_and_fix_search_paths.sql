-- Fix search path on overloaded match_faq_articles
ALTER FUNCTION public.match_faq_articles(vector, integer, double precision) SET search_path = public, pg_temp;
ALTER FUNCTION public.match_faq_articles(vector, double precision, integer) SET search_path = public, pg_temp;

-- Revoke execute from PUBLIC on trigger / internal security definer functions
REVOKE ALL ON FUNCTION public.handle_new_sso_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.initialize_student_clearances(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;

-- Only authenticated users (or specific roles) should call is_admin or initialize_student_clearances if needed
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_student_clearances(uuid) TO authenticated;
