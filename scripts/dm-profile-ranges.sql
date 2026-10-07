begin;
alter table public.dm_profile_overrides add column if not exists from_sent_at timestamptz;
alter table public.dm_profile_overrides add column if not exists from_message_id text references public.dm_messages(id);
alter table public.dm_profile_overrides add column if not exists from_body_index integer;
notify pgrst, 'reload schema';
commit;
