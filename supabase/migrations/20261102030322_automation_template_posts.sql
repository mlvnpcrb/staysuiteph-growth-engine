-- Compile owner-selected template versions into immutable automation post jobs.
-- Template blobs remain private; references never grant cross-owner access.
alter table public.campaign_media
 add column source_template_id uuid references public.post_templates(id) on delete set null,
 add column source_asset_id uuid,
 add column source_object_path text;
create index campaign_media_source_template on public.campaign_media(source_template_id) where source_template_id is not null;
create table public.automation_prepared_posts (
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 campaign_id uuid not null unique references public.campaign_jobs(id) on delete cascade,
 template_id uuid references public.post_templates(id) on delete set null,
 template_revision integer not null check(template_revision>0),
 template_snapshot jsonb not null,
 job_snapshot jsonb not null,
 request_hash text not null check(request_hash~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 primary key(user_id,request_id)
);
create index automation_prepared_posts_template on public.automation_prepared_posts(template_id) where template_id is not null;
alter table public.automation_prepared_posts enable row level security;
alter table public.automation_prepared_posts force row level security;
revoke all on public.automation_prepared_posts from public,anon,authenticated;
grant select on public.automation_prepared_posts to authenticated;
create policy prepared_posts_owner_read on public.automation_prepared_posts for select to authenticated using(user_id=(select auth.uid()));

create function staysuite_flow_private.prepared_source_ready(p_id uuid) returns boolean
 language sql stable security invoker set search_path='' as $$
 select case when p.campaign_id is null then true else
  t.id is not null and t.user_id=c.user_id and t.state='ready' and t.revision=p.template_revision
  and p.template_snapshot=jsonb_build_object('id',t.id,'name',t.name,'text',t.text,'assets',t.assets)
  and p.job_snapshot=jsonb_build_object('title',c.title,'description',c.description,'plan',c.plan,'settings',c.settings,'actor_id',c.actor_id,'actor_type',c.actor_type)
  and (select count(*) from public.campaign_media m where m.campaign_id=c.id)=jsonb_array_length(c.plan->'media')
  and not exists(
   select 1 from public.campaign_media m where m.campaign_id=c.id and not coalesce(
    m.uploaded and m.manifest=c.plan->'media'->m.position and m.source_template_id=t.id
    and exists(select 1 from jsonb_array_elements(t.assets) a where a->>'id'=m.source_asset_id::text
      and a->>'object_path'=m.source_object_path and a->'uploaded'='true'::jsonb
      and jsonb_build_object('name',a->'name','type',a->'content_type','size',a->'size','sha256',a->'sha256')=m.manifest)
    and exists(select 1 from storage.objects o where o.bucket_id='template-media' and o.name=m.source_object_path
      and o.metadata->>'size'=m.manifest->>'size' and o.metadata->>'mimetype'=m.manifest->>'type'),false)
  ) end
 from public.campaign_jobs c left join public.automation_prepared_posts p on p.campaign_id=c.id and p.user_id=c.user_id
 left join public.post_templates t on t.id=p.template_id
 where c.id=p_id and c.user_id=auth.uid()
$$;
revoke all on function staysuite_flow_private.prepared_source_ready(uuid) from public,anon,authenticated;
-- Preserve existing approval hashes byte-for-byte for ordinary campaigns.
create or replace function staysuite_campaign_private.snapshot(p_id uuid) returns text
language sql stable security invoker set search_path='' as $$
 select encode(sha256(convert_to((jsonb_build_object(
 'plan',c.plan,'title',c.title,'description',c.description,'settings',c.settings,'actor',jsonb_build_array(c.actor_type,c.actor_id),
 'targets',(select jsonb_agg(jsonb_build_array(t.position,g.id,g.identity,g.url,g.updated_at,g.review_status,g.rule_evidence,g.last_reviewed_at,g.marketing_evidence) order by t.position)
   from public.campaign_targets t join public.saved_groups g on g.id=t.group_id where t.campaign_id=c.id),
 'media',(select jsonb_agg(jsonb_build_array(m.position,m.object_path,m.manifest,m.uploaded) order by m.position) from public.campaign_media m where m.campaign_id=c.id)
 )||case when p.campaign_id is null then '{}'::jsonb else jsonb_build_object('template_source',jsonb_build_object(
 'template_id',p.template_id,'revision',p.template_revision,'snapshot',p.template_snapshot,
 'current',case when t.id is null then null else jsonb_build_object('id',t.id,'revision',t.revision,'state',t.state,'name',t.name,'text',t.text,'assets',t.assets) end,
 'references',(select jsonb_agg(jsonb_build_array(m.position,m.source_template_id,m.source_asset_id,m.source_object_path) order by m.position) from public.campaign_media m where m.campaign_id=c.id))) end)::text,'UTF8')),'hex')
 from public.campaign_jobs c left join public.automation_prepared_posts p on p.campaign_id=c.id
 left join public.post_templates t on t.id=p.template_id where c.id=p_id
$$;

create function staysuite_flow_private.template_campaign_gate(p_id uuid,p_revision integer,p_command text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Sign in required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('schedule-owner:'||u::text,0));
 if exists(select 1 from public.automation_prepared_posts where campaign_id=p_id and user_id=u) then
  perform 1 from public.post_templates t join public.automation_prepared_posts p on p.template_id=t.id where p.campaign_id=p_id and p.user_id=u for share of t;
  if p_command in('edit','bind_actor','reserve_media','media_uploaded') then raise exception 'Prepare a new version from the saved template' using errcode='55000';end if;
  if p_command in('approve','start','resume','claim','validate_one') and not coalesce(staysuite_flow_private.prepared_source_ready(p_id),false) then raise exception 'Template version or private media changed; prepare and review again' using errcode='PT409';end if;
 end if;
 return staysuite_flow_private.campaign_gate(p_id,p_revision,p_command,p_payload);
end $$;
revoke all on function staysuite_flow_private.campaign_gate(uuid,integer,text,jsonb) from authenticated;
revoke all on function staysuite_flow_private.template_campaign_gate(uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function staysuite_flow_private.template_campaign_gate(uuid,integer,text,jsonb) to authenticated;
create or replace function public.campaign_command(p_id uuid,p_revision integer,p_command text,p_payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select staysuite_flow_private.template_campaign_gate(p_id,p_revision,p_command,p_payload)$$;

create function staysuite_flow_private.prepare_template(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();t public.post_templates;p public.automation_prepared_posts;c public.campaign_jobs;v_hash text;job_id uuid;manifest jsonb;asset jsonb;position integer:=0;media_id uuid;v_plan jsonb;
begin
 if u is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Sign in required' using errcode='42501';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>64000
  or p_payload-array['request_id','template_id','template_revision','group_ids','actor_id','actor_type','interval_minutes','settings']::text[]<>'{}'::jsonb
  or not(p_payload?&array['request_id','template_id','template_revision','group_ids','actor_id','actor_type','interval_minutes','settings'])
  or jsonb_typeof(p_payload->'request_id') is distinct from 'string' or jsonb_typeof(p_payload->'template_id') is distinct from 'string'
  or jsonb_typeof(p_payload->'actor_id') is distinct from 'string' or coalesce(p_payload->>'actor_id','')!~'^[1-9][0-9]{0,79}$'
  or coalesce(p_payload->>'actor_type','') not in('personal','page')
  or jsonb_typeof(p_payload->'template_revision') is distinct from 'number' or coalesce(p_payload->>'template_revision','')!~'^[1-9][0-9]{0,8}$'
 then raise exception 'Invalid template post request' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('schedule-owner:'||u::text,0));
 v_hash:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 select * into p from public.automation_prepared_posts where user_id=u and request_id=(p_payload->>'request_id')::uuid;
 if found then
  if p.request_hash<>v_hash then raise exception 'Preparation request changed' using errcode='PT409';end if;
  if not coalesce(staysuite_flow_private.prepared_source_ready(p.campaign_id),false) then raise exception 'Template changed; prepare a new version' using errcode='PT409';end if;
  return jsonb_build_object('job',public.campaign_command(p.campaign_id,0,'inspect','{}'),'prepared',to_jsonb(p),'viewer_id',u);
 end if;
 select * into t from public.post_templates where id=(p_payload->>'template_id')::uuid and user_id=u for share;
 if not found then raise exception 'Template unavailable' using errcode='42501';end if;
 if t.revision<>(p_payload->>'template_revision')::int or t.state<>'ready' then raise exception 'Template changed or unfinished' using errcode='PT409';end if;
 -- Do not truncate content or substitute text for unsupported media-only posts.
 if char_length(btrim(t.text)) not between 1 and 10000 then raise exception 'Current publisher requires post text up to 10000 characters' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(t.assets) a where a->'uploaded' is distinct from 'true'::jsonb) then raise exception 'Finish template uploads' using errcode='55000';end if;
 select coalesce(jsonb_agg(jsonb_build_object('name',a->'name','type',a->'content_type','size',a->'size','sha256',a->'sha256') order by n),'[]'::jsonb) into manifest from jsonb_array_elements(t.assets) with ordinality v(a,n);
 v_plan:=jsonb_build_object('version',1,'text',t.text,'groupIds',p_payload->'group_ids','intervalMinutes',p_payload->'interval_minutes','media',manifest);
 job_id:=gen_random_uuid();
 perform public.campaign_command(job_id,0,'create',jsonb_build_object('title',t.name,'plan',v_plan,'settings',p_payload->'settings','actor_id',p_payload->'actor_id','actor_type',p_payload->'actor_type'));
 for asset in select value from jsonb_array_elements(t.assets) loop
  media_id:=gen_random_uuid();
  insert into public.campaign_media(id,campaign_id,position,object_path,manifest,uploaded,source_template_id,source_asset_id,source_object_path)
   values(media_id,job_id,position,u::text||'/'||job_id::text||'/'||media_id::text,manifest->position,true,t.id,(asset->>'id')::uuid,asset->>'object_path');position:=position+1;
 end loop;
 select * into c from public.campaign_jobs where id=job_id;
 insert into public.automation_prepared_posts(user_id,request_id,campaign_id,template_id,template_revision,template_snapshot,job_snapshot,request_hash)
 values(u,(p_payload->>'request_id')::uuid,c.id,t.id,t.revision,jsonb_build_object('id',t.id,'name',t.name,'text',t.text,'assets',t.assets),
 jsonb_build_object('title',c.title,'description',c.description,'plan',c.plan,'settings',c.settings,'actor_id',c.actor_id,'actor_type',c.actor_type),v_hash) returning * into p;
 if not coalesce(staysuite_flow_private.prepared_source_ready(c.id),false) then raise exception 'Template attachment is unavailable or changed' using errcode='55000';end if;
 return jsonb_build_object('job',public.campaign_command(c.id,0,'inspect','{}'),'prepared',to_jsonb(p),'viewer_id',u);
end $$;
revoke all on function staysuite_flow_private.prepare_template(jsonb) from public,anon,authenticated;
grant execute on function staysuite_flow_private.prepare_template(jsonb) to authenticated;
create function public.automation_prepare_template(p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select staysuite_flow_private.prepare_template(p_payload)$$;
revoke all on function public.automation_prepare_template(jsonb) from public,anon,authenticated;
grant execute on function public.automation_prepare_template(jsonb) to authenticated;
notify pgrst,'reload schema';
