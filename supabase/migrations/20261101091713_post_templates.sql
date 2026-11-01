-- StaySuite-owned template storage. No existing groups/campaigns/Auth rows change.
create function public.template_assets_valid(items jsonb, owner_id uuid, template_id uuid)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare item jsonb; seen text[] := '{}';
begin
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items)>10 then return false; end if;
  for item in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(item)<>'object' or item->>'id' is null
      or item->>'id' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' or item->>'id'=any(seen)
      or item->>'object_path' is distinct from owner_id::text || '/' || template_id::text || '/' || (item->>'id')
      or coalesce(item->>'content_type','') not in ('image/jpeg','image/png','image/gif','image/webp','video/mp4','video/webm','video/quicktime')
      or jsonb_typeof(item->'size') is distinct from 'number'
      or trunc((item->>'size')::numeric) <> (item->>'size')::numeric
      or (item->>'size')::numeric < 1 or (item->>'size')::numeric > 36700160
      or item->>'sha256' is null or item->>'sha256' !~ '^[a-f0-9]{64}$'
      or char_length(coalesce(item->>'name','')) not between 1 and 255
      or jsonb_typeof(item->'uploaded') is distinct from 'boolean'
      or item - array['id','name','content_type','size','sha256','object_path','uploaded']::text[] <> '{}'::jsonb
    then return false; end if;
    seen := array_append(seen,item->>'id');
  end loop;
  return true;
exception when others then return false;
end $$;
revoke all on function public.template_assets_valid(jsonb,uuid,uuid) from public;
grant execute on function public.template_assets_valid(jsonb,uuid,uuid) to authenticated;
create table public.post_templates (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(char_length(btrim(name)) between 1 and 50),
 text text not null default '' check(char_length(text)<=12000),
 assets jsonb not null default '[]'::jsonb,
 revision integer not null default 1 check(revision>0),
 state text not null default 'draft' check(state in ('draft','ready','deleting')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check (public.template_assets_valid(assets,user_id,id)),
 check (char_length(btrim(text))>0 or jsonb_array_length(assets)>0)
);
create index post_templates_owner_updated on public.post_templates(user_id,updated_at desc,id);
alter table public.post_templates enable row level security;
alter table public.post_templates force row level security;
revoke all on public.post_templates from public,anon,authenticated;
grant select,delete on public.post_templates to authenticated;
grant insert(id,user_id,name,text,assets,state) on public.post_templates to authenticated;
grant update(name,text,assets,revision,state) on public.post_templates to authenticated;
create policy templates_owner_select on public.post_templates for select to authenticated using(user_id=(select auth.uid()));
create policy templates_owner_insert on public.post_templates for insert to authenticated with check(user_id=(select auth.uid()));
create policy templates_owner_update on public.post_templates for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy templates_owner_delete on public.post_templates for delete to authenticated using(user_id=(select auth.uid()));
create function public.touch_post_template() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.id is distinct from old.id or new.user_id is distinct from old.user_id or new.created_at is distinct from old.created_at then raise exception 'Immutable template identity' using errcode='42501'; end if;
 if old.state='deleting' or new.revision<>old.revision+1 then raise exception 'Template changed or deleting' using errcode='40001'; end if;
 new.updated_at=now(); return new;
end $$;
revoke all on function public.touch_post_template() from public;
create trigger touch_post_template before update on public.post_templates for each row execute function public.touch_post_template();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('template-media','template-media',false,36700160,array['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/webm','video/quicktime']);
create policy template_media_owner_read on storage.objects for select to authenticated using(bucket_id='template-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy template_media_owner_insert on storage.objects for insert to authenticated with check(bucket_id='template-media' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.post_templates t where t.user_id=(select auth.uid()) and t.id::text=(storage.foldername(storage.objects.name))[2] and t.state<>'deleting' and exists(select 1 from jsonb_array_elements(t.assets) a where a->>'object_path'=storage.objects.name)));
create policy template_media_owner_delete on storage.objects for delete to authenticated using(bucket_id='template-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
