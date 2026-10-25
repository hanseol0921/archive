-- DM media publication follows archive_extra_visibility, not the DM chat tab.
begin;
alter table public.photos add column if not exists dm_sent_at timestamptz;
update public.photos p set dm_sent_at = m.sent_at
from public.dm_messages m
where p.dm_asset_id is not null
  and m.id = regexp_replace(p.dm_asset_id, ':[0-9]+$', '')
  and p.dm_sent_at is distinct from m.sent_at;

create or replace function public.archive_set_dm_photo_time()
returns trigger language plpgsql security definer set search_path = public
as $photo_time$
begin
  if nullif(new.dm_asset_id, '') is not null then
    new.dm_sent_at := (select sent_at from public.dm_messages
      where id = regexp_replace(new.dm_asset_id, ':[0-9]+$', ''));
  end if;
  return new;
end;
$photo_time$;
revoke all on function public.archive_set_dm_photo_time() from public;
drop trigger if exists archive_dm_photo_time on public.photos;
create trigger archive_dm_photo_time before insert or update of dm_asset_id on public.photos
for each row execute function public.archive_set_dm_photo_time();

create or replace function public.archive_dm_media_is_public()
returns boolean language sql stable security definer set search_path = public
as $media_public$
  select coalesce((select value::jsonb -> 'dm' = 'true'::jsonb
    from public.site_settings where key = 'archive_extra_visibility'), false);
$media_public$;
revoke all on function public.archive_dm_media_is_public() from public;
grant execute on function public.archive_dm_media_is_public() to anon, authenticated;

create or replace function public.archive_is_dm_media(row_data jsonb)
returns boolean language sql immutable strict set search_path = public
as $dm_row$
  select nullif(row_data->>'dm_asset_id','') is not null
    or nullif(row_data->>'dm_sent_at','') is not null
    or lower(coalesce(row_data->>'type','')) = 'dm'
    or lower(coalesce(row_data->>'source','')) = 'dm'
    or lower(coalesce(row_data->>'source_type','')) = 'dm'
    or exists (select 1 from jsonb_array_elements_text(
      case when jsonb_typeof(row_data->'tags') = 'array' then row_data->'tags' else '[]'::jsonb end
    ) tag where lower(trim(tag)) = 'dm')
    or exists (select 1 from jsonb_array_elements_text(
      case when jsonb_typeof(row_data->'search_tags') = 'array' then row_data->'search_tags' else '[]'::jsonb end
    ) tag where lower(trim(tag)) = 'dm');
$dm_row$;
revoke all on function public.archive_is_dm_media(jsonb) from public;
grant execute on function public.archive_is_dm_media(jsonb) to anon, authenticated;

do $policies$
declare t text;
  dm_condition text;
  public_condition text;
begin
  foreach t in array array['photos','videos'] loop
    if to_regclass('public.' || t) is null then raise exception 'Expected table public.% is missing', t; end if;
    dm_condition := format('public.archive_is_dm_media(to_jsonb(%I))', t);
    public_condition := format(
      '(public.archive_dm_media_is_public() and coalesce(to_jsonb(%1$I)->>''archive_visible'', ''true'') <> ''false'' and coalesce(to_jsonb(%1$I)->>''type'', '''') not in (''스크린샷'', ''같은사진'', ''짤''))', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists dm_private_read_guard on public.%I', t);
    execute format('create policy dm_private_read_guard on public.%I as restrictive for select to public using (auth.uid() = ''72d934cf-ddeb-49cb-8d57-51bc35da492c''::uuid or not %s or %s)', t, dm_condition, public_condition);
    execute format('drop policy if exists dm_media_public_read on public.%I', t);
    execute format('create policy dm_media_public_read on public.%I for select to anon, authenticated using (%s and %s)', t, dm_condition, public_condition);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end;
$policies$;
commit;
