-- Apply in Supabase SQL Editor before importing a DM archive.
begin;
create table if not exists public.dm_rooms (
  id text primary key, artist_name text not null, display_name text not null
);
create table if not exists public.dm_messages (
  id text primary key, room_id text not null references public.dm_rooms(id),
  sent_at timestamptz not null, sender_type text not null check (sender_type = 'ARTIST'),
  text text not null default '', blocks jsonb not null default '[]', deleted boolean not null default false
);
create index if not exists dm_messages_timeline on public.dm_messages(room_id, sent_at, id);
create table if not exists public.dm_profiles (
  id text primary key, room_id text not null references public.dm_rooms(id),
  observed_at timestamptz not null, name text not null, official_name text not null,
  status_emoji text not null default '', avatar_url text, official_avatar_url text
);
alter table public.photos add column if not exists dm_asset_id text;
alter table public.videos add column if not exists dm_asset_id text;
alter table public.videos add column if not exists dm_sent_at timestamptz;
create unique index if not exists photos_dm_asset_unique on public.photos(dm_asset_id);
create unique index if not exists videos_dm_asset_unique on public.videos(dm_asset_id);
do $$
declare t text;
begin
  foreach t in array array['dm_rooms','dm_messages','dm_profiles'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists dm_read on public.%I', t);
    execute format('create policy dm_read on public.%I for select to authenticated using (auth.uid() = ''72d934cf-ddeb-49cb-8d57-51bc35da492c''::uuid)', t);
    execute format('drop policy if exists dm_admin on public.%I', t);
    execute format('create policy dm_admin on public.%I for all to authenticated using (auth.uid() = ''72d934cf-ddeb-49cb-8d57-51bc35da492c''::uuid) with check (auth.uid() = ''72d934cf-ddeb-49cb-8d57-51bc35da492c''::uuid)', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- One import batch and its gallery registrations commit together. No service-role bypass.
create or replace function public.import_weverse_dm(p_room jsonb, p_messages jsonb, p_profiles jsonb)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare m jsonb; b jsonb; p jsonb; room_key text := p_room->>'id';
begin
  if auth.uid() is distinct from '72d934cf-ddeb-49cb-8d57-51bc35da492c'::uuid then
    raise exception 'Administrator required';
  end if;
  insert into public.dm_rooms(id, artist_name, display_name)
    values(room_key, p_room->>'artist_name', p_room->>'display_name')
    on conflict(id) do update set artist_name=excluded.artist_name, display_name=excluded.display_name;
  for p in select value from jsonb_array_elements(p_profiles) loop
    insert into public.dm_profiles(id, room_id, observed_at, name, official_name, status_emoji, avatar_url, official_avatar_url)
    values(p->>'id', room_key, (p->>'observed_at')::timestamptz, p->>'name', p->>'official_name',
           coalesce(p->>'status_emoji',''), p->>'avatar_url', p->>'official_avatar_url')
    on conflict(id) do nothing;
  end loop;
  for m in select value from jsonb_array_elements(p_messages) loop
    if m->>'sender_type' is distinct from 'ARTIST' or m->>'room_id' is distinct from room_key then
      raise exception 'Only artist messages from the selected room are allowed';
    end if;
    insert into public.dm_messages(id,room_id,sent_at,sender_type,text,blocks,deleted)
    values(m->>'id',room_key,(m->>'sent_at')::timestamptz,'ARTIST',coalesce(m->>'text',''),m->'blocks',coalesce((m->>'deleted')::boolean,false))
    on conflict(id) do update set text=excluded.text,blocks=excluded.blocks,deleted=excluded.deleted;
    -- Remove gallery entries for changed/deleted media before re-registering current blocks.
    delete from public.photos where dm_asset_id like (m->>'id') || ':%'
      and not exists (select 1 from jsonb_array_elements(m->'blocks') x where x->>'asset_id'=dm_asset_id and x->>'type'='photo' and not coalesce((m->>'deleted')::boolean,false));
    delete from public.videos where dm_asset_id like (m->>'id') || ':%'
      and not exists (select 1 from jsonb_array_elements(m->'blocks') x where x->>'asset_id'=dm_asset_id and x->>'type'='video' and not coalesce((m->>'deleted')::boolean,false));
    if coalesce((m->>'deleted')::boolean,false) then continue; end if;
    for b in select value from jsonb_array_elements(m->'blocks') loop
      if b->>'type' in ('photo','video','audio') and (b->>'url' is null or b->>'url' not like 'https://media.riwooarchive.com/%') then
        raise exception 'Persistent archive media URL required';
      end if;
      if b->>'type'='photo' then
        insert into public.photos(dm_asset_id,image_url,thumbnail_url,date,type,tags,search_tags,archive_visible,crop_position)
        values(b->>'asset_id',b->>'url',coalesce(b->>'thumbnail_url',b->>'url'),
          ((m->>'sent_at')::timestamptz at time zone 'Asia/Seoul')::date,'',array['DM'],array['DM'],true,'50% 50%')
        on conflict(dm_asset_id) do update set image_url=excluded.image_url,thumbnail_url=excluded.thumbnail_url,
          tags=array(select distinct unnest(coalesce(photos.tags,array[]::text[]) || array['DM']));
      elsif b->>'type'='video' then
        insert into public.videos(dm_asset_id,video_url,thumbnail_url,dm_sent_at,type,tags,search_tags,crop_position)
        values(b->>'asset_id',b->>'url',b->>'thumbnail_url',(m->>'sent_at')::timestamptz,'',array['DM'],array['DM'],'50% 50%')
        on conflict(dm_asset_id) do update set video_url=excluded.video_url,thumbnail_url=excluded.thumbnail_url,dm_sent_at=excluded.dm_sent_at,
          tags=array(select distinct unnest(coalesce(videos.tags,array[]::text[]) || array['DM']));
      end if;
    end loop;
  end loop;
end $$;
revoke all on function public.import_weverse_dm(jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.import_weverse_dm(jsonb,jsonb,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
