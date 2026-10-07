-- Apply in Supabase SQL Editor. Keep DM records available only to the administrator.
-- Restrictive policies also constrain any existing permissive public read policies.
begin;
do $$
declare t text;
  admin_condition text := '(auth.uid() = ''72d934cf-ddeb-49cb-8d57-51bc35da492c''::uuid)';
  dm_condition text;
begin
  foreach t in array array['dm_rooms','dm_messages','dm_profiles','photos','videos'] loop
    if to_regclass('public.' || t) is null then
      raise exception 'Expected table public.% is missing', t;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists dm_private_read_guard on public.%I', t);
    execute format('drop policy if exists dm_private_admin_read on public.%I', t);
    if t in ('photos','videos') then
      -- JSON access tolerates the different photo/video DM metadata columns.
      dm_condition := format(
        '(nullif(to_jsonb(%1$I)->>''dm_asset_id'', '''') is not null
          or nullif(to_jsonb(%1$I)->>''dm_sent_at'', '''') is not null
          or lower(coalesce(to_jsonb(%1$I)->>''type'', '''')) = ''dm''
          or lower(coalesce(to_jsonb(%1$I)->>''source'', '''')) = ''dm''
          or lower(coalesce(to_jsonb(%1$I)->>''source_type'', '''')) = ''dm''
          or exists (select 1 from jsonb_array_elements_text(coalesce(to_jsonb(%1$I)->''tags'', ''[]''::jsonb)) tag where lower(trim(tag)) = ''dm'')
          or exists (select 1 from jsonb_array_elements_text(coalesce(to_jsonb(%1$I)->''search_tags'', ''[]''::jsonb)) tag where lower(trim(tag)) = ''dm''))', t);
      execute format('create policy dm_private_read_guard on public.%I as restrictive for select to public using (%s or not %s)', t, admin_condition, dm_condition);
    else
      execute format('create policy dm_private_read_guard on public.%I as restrictive for select to public using (%s)', t, admin_condition);
    end if;
    execute format('create policy dm_private_admin_read on public.%I for select to authenticated using (%s)', t, admin_condition);
  end loop;
end $$;
commit;
