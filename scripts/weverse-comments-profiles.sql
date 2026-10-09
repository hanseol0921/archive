begin;
create table if not exists public.weverse_comment_posts (
  id text primary key, artist_member_id text not null, author text not null,
  author_type text not null check(author_type in ('artist','fan')),
  is_target_artist boolean not null, text text not null default '', url text not null default '',
  membership_only boolean not null default false, images jsonb not null default '[]',
  check(author_type <> 'fan' or author = '원도어')
);
create table if not exists public.weverse_comments (
  id text primary key, post_id text not null references public.weverse_comment_posts(id),
  parent_comment_id text references public.weverse_comments(id) deferrable initially deferred,
  artist_member_id text not null, author text not null, author_type text not null,
  is_target_artist boolean not null, text text not null default '', created_at timestamptz,
  images jsonb not null default '[]', links jsonb not null default '[]',
  check(author_type in ('artist','fan')), check(author_type <> 'fan' or author = '원도어')
);
create index if not exists weverse_comments_post_date on public.weverse_comments(post_id,created_at,id);
create table if not exists public.weverse_profile_snapshots (
  id text primary key, member_id text not null, observed_at timestamptz not null,
  effective_at timestamptz, time_basis text not null check(time_basis in ('observed','verified')),
  name text not null, message text not null default '', avatar_url text not null default '',
  background_url text not null default '',
  check(time_basis <> 'verified' or effective_at is not null)
);
create table if not exists public.weverse_profile_overrides (
  id uuid primary key default gen_random_uuid(), member_id text not null,
  from_at timestamptz not null, through_at timestamptz not null, name text not null,
  message text not null default '', avatar_url text not null default '', background_url text not null default '',
  created_at timestamptz not null default now(), check(from_at <= through_at)
);
alter table public.weverse_profile_snapshots add column if not exists post_ids text[] not null default '{}';
alter table public.weverse_comment_posts enable row level security;
alter table public.weverse_comments enable row level security;
alter table public.weverse_profile_snapshots enable row level security;
alter table public.weverse_profile_overrides enable row level security;
drop policy if exists wv_posts_read on public.weverse_comment_posts;
create policy wv_posts_read on public.weverse_comment_posts for select to anon,authenticated
using(not membership_only or auth.uid()='72d934cf-ddeb-49cb-8d57-51bc35da492c'::uuid);
drop policy if exists wv_comments_read on public.weverse_comments;
create policy wv_comments_read on public.weverse_comments for select to anon,authenticated
using(exists(select 1 from public.weverse_comment_posts p where p.id=post_id));
drop policy if exists wv_profiles_read on public.weverse_profile_snapshots;
create policy wv_profiles_read on public.weverse_profile_snapshots for select to anon,authenticated using(true);
drop policy if exists wv_ranges_read on public.weverse_profile_overrides;
create policy wv_ranges_read on public.weverse_profile_overrides for select to anon,authenticated using(true);
drop policy if exists wv_ranges_write on public.weverse_profile_overrides;
create policy wv_ranges_write on public.weverse_profile_overrides for all to authenticated
using(auth.uid()='72d934cf-ddeb-49cb-8d57-51bc35da492c'::uuid)
with check(auth.uid()='72d934cf-ddeb-49cb-8d57-51bc35da492c'::uuid);
grant select on public.weverse_comment_posts, public.weverse_comments,public.weverse_profile_snapshots,public.weverse_profile_overrides to anon,authenticated;
grant insert,update,delete on public.weverse_profile_overrides to authenticated;

create or replace function public.import_weverse_comments(p_posts jsonb,p_comments jsonb,p_profiles jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is distinct from '72d934cf-ddeb-49cb-8d57-51bc35da492c'::uuid then
    raise exception 'Admin only';
  end if;
  insert into public.weverse_comment_posts(id,artist_member_id,author,author_type,is_target_artist,text,url,membership_only,images)
  select id,artist_member_id,case when author_type='fan' then '원도어' else author end,author_type,is_target_artist,text,url,membership_only,images
  from jsonb_to_recordset(p_posts) as x(id text,artist_member_id text,author text,author_type text,is_target_artist boolean,text text,url text,membership_only boolean,images jsonb)
  on conflict(id) do update set text=excluded.text,author=excluded.author,url=excluded.url,images=excluded.images,membership_only=excluded.membership_only;
  insert into public.weverse_comments(id,post_id,parent_comment_id,artist_member_id,author,author_type,is_target_artist,text,created_at,images,links)
  select id,post_id,parent_comment_id,artist_member_id,case when author_type='fan' then '원도어' else author end,author_type,is_target_artist,text,created_at,images,links
  from jsonb_to_recordset(p_comments) as x(id text,post_id text,parent_comment_id text,artist_member_id text,author text,author_type text,is_target_artist boolean,text text,created_at timestamptz,images jsonb,links jsonb)
  on conflict(id) do update set text=excluded.text,parent_comment_id=excluded.parent_comment_id,images=excluded.images,links=excluded.links;
  insert into public.weverse_profile_snapshots(id,member_id,observed_at,effective_at,time_basis,name,message,avatar_url,background_url,post_ids)
  select id,member_id,observed_at,effective_at,time_basis,name,message,avatar_url,background_url,coalesce(post_ids,'{}')
  from jsonb_to_recordset(p_profiles) as x(id text,member_id text,observed_at timestamptz,effective_at timestamptz,time_basis text,name text,message text,avatar_url text,background_url text,post_ids text[])
  on conflict(id) do update set post_ids=array(select distinct unnest(weverse_profile_snapshots.post_ids||excluded.post_ids));
end $$;
revoke all on function public.import_weverse_comments(jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.import_weverse_comments(jsonb,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
