-- Optional persistent tagging migration. Review/run in Supabase SQL Editor.
-- Existing tags are retained. Folders are classified by the application.
begin;
create or replace function public.ensure_video_source_tags()
returns trigger language plpgsql set search_path = '' as $$
declare
  row_data jsonb := to_jsonb(new);
  post_url text := '';
  marker_text text;
begin
  if row_data->>'post_id' is not null then
    select coalesce(p.weverse_url,'') into post_url from public.weverse_posts p
    where p.id::text = row_data->>'post_id';
  end if;
  marker_text := lower(concat_ws(' ', row_data->>'type', row_data->>'source', row_data->>'source_type',
    row_data->>'tags',row_data->>'search_tags',row_data->>'weverse_url',row_data->>'video_url',post_url));
  if marker_text ~ '(모먼트|moment)' and not ('모먼트' = any(coalesce(new.tags,array[]::text[]))) then
    new.tags := array_append(coalesce(new.tags,array[]::text[]),'모먼트');
  end if;
  if nullif(row_data->>'dm_asset_id','') is not null or nullif(row_data->>'dm_sent_at','') is not null
    or lower(coalesce(row_data->>'type','')) = 'dm'
    or lower(coalesce(row_data->>'source','')) = 'dm'
    or lower(coalesce(row_data->>'source_type','')) = 'dm'
    or exists (select 1 from jsonb_array_elements_text(coalesce(nullif(row_data->'tags','null'::jsonb),'[]'::jsonb)) t where lower(trim(t.value))='dm')
    or exists (select 1 from jsonb_array_elements_text(coalesce(nullif(row_data->'search_tags','null'::jsonb),'[]'::jsonb)) t where lower(trim(t.value))='dm')
    or concat_ws(' ',row_data->>'video_url',row_data->>'weverse_url',post_url) ~* '(^|[/ _-])dm($|[/ _.?-])' then
    if not ('DM' = any(coalesce(new.tags,array[]::text[]))) then
      new.tags := array_append(coalesce(new.tags,array[]::text[]),'DM');
    end if;
  end if;
  return new;
end $$;
revoke all on function public.ensure_video_source_tags() from public, anon, authenticated;
drop trigger if exists video_source_tags on public.videos;
create trigger video_source_tags before insert or update on public.videos
for each row execute function public.ensure_video_source_tags();
-- Apply the trigger to existing rows too. Run during a quiet period for large libraries.
update public.videos set tags = tags;
commit;
