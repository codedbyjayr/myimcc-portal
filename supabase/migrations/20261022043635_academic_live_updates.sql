-- Enable change notifications without changing data, grants or row policies.
do $$
declare table_name text;
begin
  foreach table_name in array array['enrollment_requests','enrollments','grades','activities','courses','course_offerings'] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=table_name) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;

-- Match the existing review-history RPC's audience and visible statuses for change delivery.
do $$
begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='enrollment_requests' and policyname='reviewers_read_request_updates') then
    create policy reviewers_read_request_updates on public.enrollment_requests
      for select to authenticated using (
        status in ('pending','approved','rejected') and (select public.is_mfa_compliant())
        and exists(select 1 from public.profiles actor where actor.id=(select auth.uid())
          and actor.role in ('dean','admin','staff','registrar')
          and actor.status='approved' and actor.is_active is true)
      );
  end if;
end $$;

