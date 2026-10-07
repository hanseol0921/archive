-- Apply in Supabase SQL Editor to cover external scrapers and every INSERT path.
-- Existing media and manually classified existing rows are not changed.
begin;
alter table public.photos alter column type set default null;
alter table public.videos alter column type set default null;
create or replace function public.default_new_media_unclassified()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.type in ('DM', '모먼트') then
    new.tags := array(select distinct unnest(coalesce(new.tags, array[]::text[]) || array[new.type]));
  end if;
  new.type := null;
  return new;
end $$;
drop trigger if exists zzz_new_media_unclassified on public.photos;
create trigger zzz_new_media_unclassified before insert on public.photos
for each row execute function public.default_new_media_unclassified();
drop trigger if exists zzz_new_media_unclassified on public.videos;
create trigger zzz_new_media_unclassified before insert on public.videos
for each row execute function public.default_new_media_unclassified();
commit;
