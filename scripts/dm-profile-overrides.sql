begin;
create table if not exists public.dm_profile_overrides (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.dm_rooms(id),
  through_sent_at timestamptz not null,
  through_message_id text not null references public.dm_messages(id),
  through_body_index integer not null default 0 check(through_body_index >= 0),
  name text not null, status_emoji text not null default '', avatar_url text not null,
  created_at timestamptz not null default now()
);
alter table public.dm_profile_overrides enable row level security;
drop policy if exists dm_override_read on public.dm_profile_overrides;
create policy dm_override_read on public.dm_profile_overrides for select to anon, authenticated using(true);
drop policy if exists dm_override_admin on public.dm_profile_overrides;
create policy dm_override_admin on public.dm_profile_overrides for all to authenticated
using(auth.uid()='72d934cf-ddeb-49cb-8d57-51bc35da492c'::uuid)
with check(auth.uid()='72d934cf-ddeb-49cb-8d57-51bc35da492c'::uuid);
grant select on public.dm_profile_overrides to anon, authenticated;
grant insert, update, delete on public.dm_profile_overrides to authenticated;
notify pgrst, 'reload schema';
commit;
