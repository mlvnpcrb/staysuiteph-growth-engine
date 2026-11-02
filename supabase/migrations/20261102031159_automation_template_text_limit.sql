-- Match JavaScript/Zod UTF-16 length without trimming the exact approved text.
create function staysuite_flow_private.utf16_length(value text) returns integer
 language sql immutable security invoker set search_path='' as $$
 select coalesce(sum(case when ascii(ch)>65535 then 2 else 1 end),0)::integer
 from regexp_split_to_table(coalesce(value,''),'') a(ch) where ch<>''
$$;
revoke all on function staysuite_flow_private.utf16_length(text) from public,anon,authenticated;

create or replace function staysuite_flow_private.prepare_template(p_payload jsonb) returns jsonb
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
 if char_length(btrim(t.text))<1 or staysuite_flow_private.utf16_length(t.text)>10000 then raise exception 'Current publisher requires post text up to 10000 characters' using errcode='22023';end if;
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

create or replace function staysuite_flow_private.template_campaign_gate(p_id uuid,p_revision integer,p_command text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Sign in required' using errcode='42501';end if;
 if p_command in('create','edit') and jsonb_typeof(p_payload->'plan'->'text')='string' and staysuite_flow_private.utf16_length(p_payload->'plan'->>'text')>10000 then raise exception 'Post text exceeds 10000 characters' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('schedule-owner:'||u::text,0));
 if exists(select 1 from public.automation_prepared_posts where campaign_id=p_id and user_id=u) then
  perform 1 from public.post_templates t join public.automation_prepared_posts p on p.template_id=t.id where p.campaign_id=p_id and p.user_id=u for share of t;
  if p_command in('edit','bind_actor','reserve_media','media_uploaded') then raise exception 'Prepare a new version from the saved template' using errcode='55000';end if;
  if p_command in('approve','start','resume','claim','validate_one') and not coalesce(staysuite_flow_private.prepared_source_ready(p_id),false) then raise exception 'Template version or private media changed; prepare and review again' using errcode='PT409';end if;
 end if;
 return staysuite_flow_private.campaign_gate(p_id,p_revision,p_command,p_payload);
end $$;
notify pgrst,'reload schema';
