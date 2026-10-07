-- Apply in Supabase SQL Editor before publishing folder management.
-- No content inserted. Existing settings policies remain in place.
begin;
do $$ begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='site_settings' and c.relrowsecurity) then
    raise exception 'site_settings RLS is disabled or table is missing. Review existing policies first.';
  end if;
end $$;
drop policy if exists video_library_read on public.site_settings;
create policy video_library_read on public.site_settings for select to anon, authenticated
using (key in ('youtube_contents','video_folders'));
drop policy if exists video_library_admin_write on public.site_settings;
create policy video_library_admin_write on public.site_settings for all to authenticated
using (key in ('youtube_contents','video_folders') and auth.uid()='72d934cf-ddeb-49cb-8d57-51bc35da492c'::uuid)
with check (key in ('youtube_contents','video_folders') and auth.uid()='72d934cf-ddeb-49cb-8d57-51bc35da492c'::uuid);
drop policy if exists video_library_insert_guard on public.site_settings;
create policy video_library_insert_guard on public.site_settings as restrictive for insert to public
with check (key not in ('youtube_contents','video_folders') or auth.uid()='72d934cf-ddeb-49cb-8d57-51bc35da492c'::uuid);
drop policy if exists video_library_update_guard on public.site_settings;
create policy video_library_update_guard on public.site_settings as restrictive for update to public
using (key not in ('youtube_contents','video_folders') or auth.uid()='72d934cf-ddeb-49cb-8d57-51bc35da492c'::uuid)
with check (key not in ('youtube_contents','video_folders') or auth.uid()='72d934cf-ddeb-49cb-8d57-51bc35da492c'::uuid);
drop policy if exists video_library_delete_guard on public.site_settings;
create policy video_library_delete_guard on public.site_settings as restrictive for delete to public
using (key not in ('youtube_contents','video_folders') or auth.uid()='72d934cf-ddeb-49cb-8d57-51bc35da492c'::uuid);
commit;
