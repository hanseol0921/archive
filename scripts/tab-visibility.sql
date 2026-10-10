-- Run once in the Supabase SQL editor. Existing write policies are preserved.
begin;
create or replace function public.archive_comments_are_public()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((select value::jsonb -> 'comments' = 'true'::jsonb
    from public.site_settings where key = 'archive_tab_visibility'), false);
$$;
revoke all on function public.archive_comments_are_public() from public;
grant execute on function public.archive_comments_are_public() to anon, authenticated;

drop policy if exists archive_comments_tab_gate on public.weverse_comments;
create policy archive_comments_tab_gate on public.weverse_comments as restrictive
for select to anon, authenticated
using (auth.uid() = '72d934cf-ddeb-49cb-8d57-51bc35da492c'::uuid or public.archive_comments_are_public());

drop policy if exists archive_comment_posts_tab_gate on public.weverse_comment_posts;
create policy archive_comment_posts_tab_gate on public.weverse_comment_posts as restrictive
for select to anon, authenticated
using (auth.uid() = '72d934cf-ddeb-49cb-8d57-51bc35da492c'::uuid or public.archive_comments_are_public());
-- DM chat access follows the visitor DM toggle. Photo/video archive DM gates
-- remain independent of the chat tab setting.
create or replace function public.archive_dm_is_public()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((select value::jsonb -> 'dm' = 'true'::jsonb
    from public.site_settings where key = 'archive_tab_visibility'), false);
$$;
revoke all on function public.archive_dm_is_public() from public;
grant execute on function public.archive_dm_is_public() to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['dm_rooms','dm_messages','dm_profiles','dm_profile_overrides'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists dm_private_read_guard on public.%I', t);
    execute format('create policy dm_private_read_guard on public.%I as restrictive for select to public using (auth.uid() = ''72d934cf-ddeb-49cb-8d57-51bc35da492c''::uuid or public.archive_dm_is_public())', t);
    execute format('drop policy if exists dm_tab_public_read on public.%I', t);
    execute format('create policy dm_tab_public_read on public.%I for select to anon, authenticated using (public.archive_dm_is_public())', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;
commit;
