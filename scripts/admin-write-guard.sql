-- Run in Supabase SQL Editor. Transaction aborts if an expected table is missing
-- or RLS is disabled: inspect existing read policies before enabling RLS.
-- Existing SELECT policies remain unchanged. Service-role/owner and SECURITY
-- DEFINER functions bypass RLS and need a separate audit.
begin;
do $$
declare
  table_name text;
  operation text;
  admin_condition text := '(auth.uid() = ''72d934cf-ddeb-49cb-8d57-51bc35da492c''::uuid)';
begin
  foreach table_name in array array['photos','videos','weverse_posts','tag_aliases','archive_tags','site_settings','profile'] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=table_name and c.relkind='r' and c.relrowsecurity) then
      raise exception 'Table public.% missing or RLS disabled. Review schema/read policies first.', table_name;
    end if;
    foreach operation in array array['insert','update','delete'] loop
      execute format('drop policy if exists %I on public.%I', 'archive_admin_allow_' || operation, table_name);
      execute format('drop policy if exists %I on public.%I', 'archive_admin_guard_' || operation, table_name);
      if operation = 'insert' then
        execute format('create policy %I on public.%I as permissive for insert to authenticated with check (%s)', 'archive_admin_allow_' || operation, table_name, admin_condition);
        execute format('create policy %I on public.%I as restrictive for insert to public with check (%s)', 'archive_admin_guard_' || operation, table_name, admin_condition);
      elsif operation = 'update' then
        execute format('create policy %I on public.%I as permissive for update to authenticated using (%s) with check (%s)', 'archive_admin_allow_' || operation, table_name, admin_condition, admin_condition);
        execute format('create policy %I on public.%I as restrictive for update to public using (%s) with check (%s)', 'archive_admin_guard_' || operation, table_name, admin_condition, admin_condition);
      else
        execute format('create policy %I on public.%I as permissive for delete to authenticated using (%s)', 'archive_admin_allow_' || operation, table_name, admin_condition);
        execute format('create policy %I on public.%I as restrictive for delete to public using (%s)', 'archive_admin_guard_' || operation, table_name, admin_condition);
      end if;
    end loop;
  end loop;
end $$;
commit;
