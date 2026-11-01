-- Owned template categories and group collections; saved groups/posts are retained.
alter table public.saved_groups add constraint saved_groups_id_owner_unique unique(id,user_id);
alter table public.post_templates add constraint post_templates_id_owner_unique unique(id,user_id);
create table public.template_categories(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(char_length(btrim(name)) between 1 and 25),revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,user_id)
);
create unique index template_category_owner_name on public.template_categories(user_id,lower(btrim(name)));
create table public.group_collections(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(char_length(btrim(name)) between 1 and 100),revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,user_id)
);
create unique index group_collection_owner_name on public.group_collections(user_id,lower(btrim(name)));
create table public.collection_groups(
 collection_id uuid not null,user_id uuid not null,group_id uuid not null,position integer not null check(position>=0 and position<1000),
 primary key(collection_id,group_id),unique(collection_id,position),
 foreign key(collection_id,user_id) references public.group_collections(id,user_id) on delete cascade,
 foreign key(group_id,user_id) references public.saved_groups(id,user_id) on delete cascade
);
create index collection_groups_owner_collection on public.collection_groups(user_id,collection_id,position);
create index collection_groups_group_owner on public.collection_groups(group_id,user_id);
create table public.post_template_categories(
 template_id uuid not null,user_id uuid not null,category_id uuid not null,primary key(template_id,category_id),
 foreign key(template_id,user_id) references public.post_templates(id,user_id) on delete cascade,
 foreign key(category_id,user_id) references public.template_categories(id,user_id) on delete cascade
);
create index post_template_categories_owner on public.post_template_categories(user_id,template_id);
create index post_template_categories_category_owner on public.post_template_categories(category_id,user_id);
alter table public.template_categories enable row level security;alter table public.template_categories force row level security;
alter table public.group_collections enable row level security;alter table public.group_collections force row level security;
alter table public.collection_groups enable row level security;alter table public.collection_groups force row level security;
alter table public.post_template_categories enable row level security;alter table public.post_template_categories force row level security;
revoke all on public.template_categories,public.group_collections,public.collection_groups,public.post_template_categories from public,anon,authenticated;
grant select on public.template_categories,public.group_collections,public.collection_groups,public.post_template_categories to authenticated;
create policy categories_owner_read on public.template_categories for select to authenticated using(user_id=(select auth.uid()));
create policy collections_owner_read on public.group_collections for select to authenticated using(user_id=(select auth.uid()));
create policy collection_groups_owner_read on public.collection_groups for select to authenticated using(user_id=(select auth.uid()));
create policy template_categories_owner_read on public.post_template_categories for select to authenticated using(user_id=(select auth.uid()));
create function public.library_snapshot() returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Sign in required' using errcode='42501';end if;
 return jsonb_build_object('viewer_id',u,
  'categories',coalesce((select jsonb_agg(to_jsonb(c) order by lower(c.name),c.id) from public.template_categories c where c.user_id=u),'[]'),
  'collections',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('group_ids',coalesce((select jsonb_agg(g.group_id order by g.position) from public.collection_groups g where g.collection_id=c.id and g.user_id=u),'[]')) order by c.created_at desc,c.id) from public.group_collections c where c.user_id=u),'[]'),
  'assignments',coalesce((select jsonb_agg(jsonb_build_object('template_id',a.template_id,'category_id',a.category_id) order by a.template_id,a.category_id) from public.post_template_categories a where a.user_id=u),'[]'));
end $$;
revoke all on function public.library_snapshot() from public,anon,authenticated;grant execute on function public.library_snapshot() to authenticated;
create schema staysuite_library_private;
revoke all on schema staysuite_library_private from public,anon,authenticated;
create function staysuite_library_private.command(p_id uuid,p_revision integer,p_operation text,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();cat public.template_categories;coll public.group_collections;t public.post_templates;items jsonb;ids uuid[];new_id uuid;v_name text;n integer;part integer;size integer;template_result jsonb;
begin
 if u is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Sign in required' using errcode='42501';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>64000 then raise exception 'Invalid library command' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('library-owner:'||u::text,0));
 if p_operation='category_create' then
  if p_revision is distinct from 0 or p_payload-array['name']::text[]<>'{}'::jsonb or jsonb_typeof(p_payload->'name') is distinct from 'string' or (select count(*) from public.template_categories where user_id=u)>=100 then raise exception 'Check category name and capacity' using errcode='22023';end if;
  insert into public.template_categories(id,user_id,name) values(p_id,u,btrim(p_payload->>'name'));
 elsif p_operation in ('category_rename','category_delete') then
  select * into cat from public.template_categories where id=p_id and user_id=u for update;if not found then raise exception 'Category not found' using errcode='42501';end if;
  if cat.revision is distinct from p_revision then raise exception 'Category changed; reload' using errcode='PT409';end if;
  if p_operation='category_rename' then
   if p_payload-array['name']::text[]<>'{}'::jsonb or jsonb_typeof(p_payload->'name') is distinct from 'string' then raise exception 'Check category name' using errcode='22023';end if;
   update public.template_categories set name=btrim(p_payload->>'name'),revision=revision+1,updated_at=now() where id=cat.id;
  else
   if p_payload<>'{}'::jsonb then raise exception 'Invalid category deletion' using errcode='22023';end if;
   update public.post_templates set revision=revision+1 where user_id=u and state<>'deleting' and id in(select template_id from public.post_template_categories where category_id=cat.id and user_id=u);
   delete from public.template_categories where id=cat.id;
  end if;
 elsif p_operation='template_assign' then
  select * into t from public.post_templates where id=p_id and user_id=u for update;if not found then raise exception 'Template not found' using errcode='42501';end if;
  if t.revision is distinct from p_revision then raise exception 'Template changed; reload' using errcode='PT409';end if;
  if t.state='deleting' then raise exception 'Template is being deleted' using errcode='55000';end if;
  items:=p_payload->'category_ids';
  if p_payload-array['category_ids']::text[]<>'{}'::jsonb or jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items)>100 then raise exception 'Choose valid categories' using errcode='22023';end if;
  select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(items);
  if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception 'Select each category once' using errcode='22023';end if;
  if (select count(*) from public.template_categories where user_id=u and id=any(ids))<>cardinality(ids) then raise exception 'Categories are not available to your account' using errcode='42501';end if;
  delete from public.post_template_categories where template_id=t.id and user_id=u;
  insert into public.post_template_categories(template_id,user_id,category_id) select t.id,u,x from unnest(ids) x;
  update public.post_templates set revision=revision+1 where id=t.id returning * into t;template_result:=to_jsonb(t);
 elsif p_operation in ('collection_create','collection_save','collection_duplicate','collection_delete','collection_split') then
  if p_operation='collection_create' then
   if p_revision is distinct from 0 then raise exception 'Invalid creation revision' using errcode='PT409';end if;
  else
   select * into coll from public.group_collections where id=p_id and user_id=u for update;if not found then raise exception 'Collection not found' using errcode='42501';end if;
   if coll.revision is distinct from p_revision then raise exception 'Collection changed; reload' using errcode='PT409';end if;
  end if;
  if p_operation in ('collection_create','collection_save') then
   if p_payload-array['name','group_ids']::text[]<>'{}'::jsonb or jsonb_typeof(p_payload->'name') is distinct from 'string' or jsonb_typeof(p_payload->'group_ids') is distinct from 'array' or jsonb_array_length(p_payload->'group_ids')>1000 then raise exception 'Check the collection name and groups' using errcode='22023';end if;
   select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(p_payload->'group_ids');
   if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception 'Select each group once' using errcode='22023';end if;
   if (select count(*) from public.saved_groups where user_id=u and id=any(ids))<>cardinality(ids) then raise exception 'Groups are not available to your account' using errcode='42501';end if;
   if p_operation='collection_create' then
    if (select count(*) from public.group_collections where user_id=u)>=200 then raise exception 'Collection capacity reached' using errcode='22023';end if;
    insert into public.group_collections(id,user_id,name) values(p_id,u,btrim(p_payload->>'name')) returning * into coll;
   else
    update public.group_collections set name=btrim(p_payload->>'name'),revision=revision+1,updated_at=now() where id=coll.id returning * into coll;
    delete from public.collection_groups where collection_id=coll.id and user_id=u;
   end if;
   if (select count(*) from public.collection_groups where user_id=u)+cardinality(ids)>10000 then raise exception 'Collection link capacity reached' using errcode='22023';end if;
   insert into public.collection_groups(collection_id,user_id,group_id,position) select coll.id,u,x,(ordinality-1)::int from unnest(ids) with ordinality a(x,ordinality);
  elsif p_operation='collection_delete' then
   if p_payload<>'{}'::jsonb then raise exception 'Invalid collection deletion' using errcode='22023';end if;
   delete from public.group_collections where id=coll.id;
  else
   if p_operation='collection_duplicate' then
    if p_payload<>'{}'::jsonb then raise exception 'Invalid duplicate command' using errcode='22023';end if;size:=1000;
   else
    if p_payload-array['size']::text[]<>'{}'::jsonb or jsonb_typeof(p_payload->'size') is distinct from 'number' or (p_payload->>'size')::numeric<>trunc((p_payload->>'size')::numeric) or (p_payload->>'size')::int not between 1 and 1000 then raise exception 'Choose a valid split size' using errcode='22023';end if;size:=(p_payload->>'size')::int;
   end if;
   select coalesce(array_agg(group_id order by position),'{}') into ids from public.collection_groups where collection_id=coll.id and user_id=u;
   n:=greatest(1,ceil(cardinality(ids)::numeric/size)::int);
   if (select count(*) from public.group_collections where user_id=u)+n>200 or (select count(*) from public.collection_groups where user_id=u)+cardinality(ids)>10000 then raise exception 'Collection capacity reached' using errcode='22023';end if;
   for part in 1..n loop
    new_id:=gen_random_uuid();v_name:=left(coll.name,70)||case when p_operation='collection_duplicate' then ' (copy)' else ' (part '||part::text||')' end;
    if exists(select 1 from public.group_collections where user_id=u and lower(btrim(name))=lower(v_name)) then v_name:=left(v_name,88)||' '||left(new_id::text,8);end if;
    insert into public.group_collections(id,user_id,name) values(new_id,u,v_name);
    insert into public.collection_groups(collection_id,user_id,group_id,position) select new_id,u,x,(ordinality-1)::int from unnest(ids[((part-1)*size+1):(part*size)]) with ordinality a(x,ordinality);
   end loop;
  end if;
 else raise exception 'Unknown library operation' using errcode='22023';end if;
 return jsonb_build_object('snapshot',public.library_snapshot(),'template',template_result);
end $$;
revoke all on function staysuite_library_private.command(uuid,integer,text,jsonb) from public,anon,authenticated;
grant usage on schema staysuite_library_private to authenticated;
grant execute on function staysuite_library_private.command(uuid,integer,text,jsonb) to authenticated;
create function public.library_command(p_id uuid,p_revision integer,p_operation text,p_payload jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$select staysuite_library_private.command(p_id,p_revision,p_operation,p_payload)$$;
revoke all on function public.library_command(uuid,integer,text,jsonb) from public,anon,authenticated;grant execute on function public.library_command(uuid,integer,text,jsonb) to authenticated;
notify pgrst,'reload schema';
