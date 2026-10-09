-- Run once in Supabase SQL Editor. Existing videos retain their data.
begin;
alter table public.videos add column if not exists overlay_text text not null default '';
comment on column public.videos.overlay_text is 'Text shown over a video, such as Weverse Moment captions';
commit;
