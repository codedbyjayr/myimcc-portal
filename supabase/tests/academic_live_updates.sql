begin;
do $$
declare t text;
begin
  foreach t in array array['enrollment_requests','enrollments','grades','activities','courses','course_offerings'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then raise exception 'Missing publication table: %',t; end if;
    if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=t and c.relrowsecurity) then raise exception 'RLS disabled: %',t; end if;
  end loop;
  if not exists(select 1 from pg_policy where polrelid='public.enrollment_requests'::regclass and polname='reviewers_read_request_updates' and polcmd='r') then raise exception 'Reviewer policy must be SELECT only'; end if;
  if not exists(select 1 from pg_policy where polrelid='public.enrollment_requests'::regclass and polname='requests_mfa' and not polpermissive) then raise exception 'Existing restrictive MFA guard missing'; end if;
end $$;
rollback;
