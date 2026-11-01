-- Lead Radar reference settings/inbox data contract. No scanner or reply adapter is enabled.
create table public.radar_settings(
 user_id uuid not null references auth.users(id) on delete cascade,scope text not null check(scope~'^(personal|page):[A-Za-z0-9_-]{1,80}$'),
 revision integer not null default 1 check(revision>0),group_ids uuid[] not null default '{}',keyword_rules jsonb not null,
 scan_interval integer not null default 30 check(scan_interval in(15,30,60)),in_page_notifications boolean not null default true,desktop_notifications boolean not null default true,
 reply_preferences jsonb not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(user_id,scope)
);
create table public.radar_leads(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,scope text not null,
 group_id uuid references public.saved_groups(id) on delete set null,group_identity text not null,group_name text not null,
 post_id text not null check(post_id~'^[1-9][0-9]{0,24}$'),url text not null,author text not null,text text not null,matched_keywords jsonb not null,
 stage text not null default 'new' check(stage in('new','replied','conversation','customer','closed')),is_read boolean not null default false,is_starred boolean not null default false,note text not null default '' check(char_length(note)<=2000),
 revision integer not null default 1 check(revision>0),discovered_at timestamptz not null default now(),post_created_at timestamptz,updated_at timestamptz not null default now(),deleted_at timestamptz,
 foreign key(user_id,scope) references public.radar_settings(user_id,scope) on delete cascade,unique(user_id,scope,group_identity,post_id)
);
create index radar_leads_inbox on public.radar_leads(user_id,scope,discovered_at desc,id desc) where deleted_at is null;
create index radar_leads_group on public.radar_leads(group_id);
alter table public.radar_settings enable row level security;alter table public.radar_settings force row level security;
alter table public.radar_leads enable row level security;alter table public.radar_leads force row level security;
revoke all on public.radar_settings,public.radar_leads from public,anon,authenticated;
grant select on public.radar_settings,public.radar_leads to authenticated;
create policy radar_settings_owner on public.radar_settings for select to authenticated using(user_id=(select auth.uid()));
create policy radar_leads_owner on public.radar_leads for select to authenticated using(user_id=(select auth.uid()) and deleted_at is null);
create schema staysuite_radar_private;revoke all on schema staysuite_radar_private from public,anon,authenticated;
create function public.radar_normalize(value text) returns text language sql immutable security invoker set search_path='' as $$
 select lower(btrim(regexp_replace(translate(normalize(value,NFKC),'‘’‚‛ʼ′＇“”„‟″＂‐‑‒–—―−',repeat(chr(39),7)||repeat('"',6)||repeat('-',7)),'[[:space:][:cntrl:]]+',' ','g')))
$$;
create function public.radar_phrase(body text,term text) returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare escaped text;
begin
 if term='' then return false;end if;
 if term~'[㐀-鿿豈-﫿぀-ヿ฀-๿຀-໿ក-៿က-႟가-힯]' then return strpos(body,term)>0;end if;
 select string_agg(case when strpos(E'\\.^$|?*+()[]{}',c)>0 then chr(92)||c else c end,'' order by n) into escaped from regexp_split_to_table(term,'') with ordinality a(c,n);
 return body~('(^|[^[:alnum:]_'||U&'\0300-\036F\1AB0-\1AFF\1DC0-\1DFF\20D0-\20FF\FE20-\FE2F'||'])'||escaped||'($|[^[:alnum:]_'||U&'\0300-\036F\1AB0-\1AFF\1DC0-\1DFF\20D0-\20FF\FE20-\FE2F'||'])');
end $$;
create function public.radar_match(body text,rules jsonb) returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare normalized text:=public.radar_normalize(body);term text;token text;matched jsonb:='[]';ok boolean;
begin
 for term in select jsonb_array_elements_text(rules->'negative') loop if public.radar_phrase(normalized,public.radar_normalize(term)) then return '[]';end if;end loop;
 for term in select jsonb_array_elements_text(rules->'exact') loop if public.radar_phrase(normalized,public.radar_normalize(term)) and not matched?term then matched:=matched||jsonb_build_array(term);end if;end loop;
 for term in select jsonb_array_elements_text(rules->'broad') loop
  ok:=true;for token in select regexp_split_to_table(public.radar_normalize(term),'[[:space:]]+') loop if not public.radar_phrase(normalized,token) then ok:=false;exit;end if;end loop;
  if ok and not matched?term then matched:=matched||jsonb_build_array(term);end if;
 end loop;return matched;
end $$;
revoke all on function public.radar_normalize(text),public.radar_phrase(text,text),public.radar_match(text,jsonb) from public,anon,authenticated;
grant execute on function public.radar_normalize(text),public.radar_phrase(text,text),public.radar_match(text,jsonb) to authenticated;
create function staysuite_radar_private.command(p_scope text,p_revision integer,p_operation text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();s public.radar_settings;l public.radar_leads;g public.saved_groups;value jsonb;ids uuid[];k text;term jsonb;matches jsonb;count_deleted integer;
begin
 if u is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Sign in required' using errcode='42501';end if;
 if p_scope is null or p_scope!~'^(personal|page):[A-Za-z0-9_-]{1,80}$' or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>64000 then raise exception 'Invalid Radar command' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('radar-owner:'||u::text,0));
 delete from public.radar_leads where user_id=u and deleted_at<now()-interval '90 days';
 select * into s from public.radar_settings where user_id=u and scope=p_scope for update;
 if p_operation='save_settings' then
  if coalesce(s.revision,0) is distinct from p_revision then raise exception 'Radar settings changed; reload' using errcode='PT409';end if;
  if s.user_id is null and (select count(*) from public.radar_settings where user_id=u)>=50 then raise exception 'Profile capacity reached' using errcode='22023';end if;
  if p_payload-array['group_ids','keyword_rules','scan_interval','in_page_notifications','desktop_notifications','reply_preferences']::text[]<>'{}'::jsonb or jsonb_typeof(p_payload->'group_ids') is distinct from 'array' or jsonb_array_length(p_payload->'group_ids')>250 or jsonb_typeof(p_payload->'keyword_rules') is distinct from 'object' or (p_payload->'keyword_rules')-array['exact','broad','negative']::text[]<>'{}'::jsonb or p_payload->'scan_interval' not in('15'::jsonb,'30'::jsonb,'60'::jsonb) or jsonb_typeof(p_payload->'in_page_notifications') is distinct from 'boolean' or jsonb_typeof(p_payload->'desktop_notifications') is distinct from 'boolean' then raise exception 'Check Radar settings' using errcode='22023';end if;
  foreach k in array array['exact','broad','negative'] loop
   value:=p_payload->'keyword_rules'->k;
   if jsonb_typeof(value) is distinct from 'array' or jsonb_array_length(value)>100 then raise exception 'Check keyword rules' using errcode='22023';end if;
   for term in select jsonb_array_elements(value) loop if jsonb_typeof(term)<>'string' or char_length(btrim(term#>>'{}')) not between 1 and 160 then raise exception 'Invalid keyword' using errcode='22023';end if;end loop;
   if jsonb_array_length(value)<>(select count(distinct x) from jsonb_array_elements_text(value) a(x)) then raise exception 'Duplicate keyword' using errcode='22023';end if;
  end loop;
  value:=p_payload->'reply_preferences';
  if jsonb_typeof(value) is distinct from 'object' or value-array['style','selling','directness','context']::text[]<>'{}'::jsonb or coalesce(value->>'style','') not in('helpful','professional','conversational') or coalesce(value->>'selling','') not in('none','soft','direct') or coalesce(value->>'directness','') not in('gentle','balanced','direct') or jsonb_typeof(value->'context') is distinct from 'string' or char_length(value->>'context')>400 then raise exception 'Check reply preferences' using errcode='22023';end if;
  select coalesce(array_agg(x::uuid),'{}') into ids from jsonb_array_elements_text(p_payload->'group_ids') a(x);
  if cardinality(ids)<>(select count(distinct x) from unnest(ids) a(x)) or (select count(*) from public.saved_groups where user_id=u and id=any(ids))<>cardinality(ids) then raise exception 'Groups unavailable to this account' using errcode='42501';end if;
  insert into public.radar_settings(user_id,scope,group_ids,keyword_rules,scan_interval,in_page_notifications,desktop_notifications,reply_preferences)
  values(u,p_scope,ids,p_payload->'keyword_rules',(p_payload->>'scan_interval')::int,(p_payload->>'in_page_notifications')::boolean,(p_payload->>'desktop_notifications')::boolean,value)
  on conflict(user_id,scope) do update set group_ids=excluded.group_ids,keyword_rules=excluded.keyword_rules,scan_interval=excluded.scan_interval,in_page_notifications=excluded.in_page_notifications,desktop_notifications=excluded.desktop_notifications,reply_preferences=excluded.reply_preferences,revision=radar_settings.revision+1,updated_at=now() returning * into s;
  return jsonb_build_object('settings',to_jsonb(s));
 end if;
 if s.user_id is null then raise exception 'Save Radar settings first' using errcode='42501';end if;
 if p_operation='ingest' then
  if s.revision is distinct from p_revision then raise exception 'Radar settings changed; reload' using errcode='PT409';end if;
  if p_payload-array['group_id','post_id','author','text','post_created_at']::text[]<>'{}'::jsonb or jsonb_typeof(p_payload->'post_id') is distinct from 'string' or p_payload->>'post_id'!~'^[1-9][0-9]{0,24}$' or jsonb_typeof(p_payload->'author') is distinct from 'string' or char_length(p_payload->>'author')>160 or jsonb_typeof(p_payload->'text') is distinct from 'string' or char_length(btrim(p_payload->>'text')) not between 1 and 20000 or not(p_payload?'post_created_at') or jsonb_typeof(p_payload->'post_created_at') not in('string','null') then raise exception 'Check the submitted post' using errcode='22023';end if;
  if (p_payload->>'post_created_at')::timestamptz>now()+interval '5 minutes' then raise exception 'Post date is in the future' using errcode='22023';end if;
  select * into g from public.saved_groups where id=(p_payload->>'group_id')::uuid and user_id=u;
  if not found or not(g.id=any(s.group_ids)) then raise exception 'Group is not in this profile monitor' using errcode='42501';end if;
  matches:=public.radar_match(p_payload->>'text',s.keyword_rules);
  if matches='[]'::jsonb then return jsonb_build_object('lead',null,'matched',false,'duplicate',false);end if;
  select * into l from public.radar_leads where user_id=u and scope=p_scope and group_identity=g.identity and post_id=p_payload->>'post_id';
  if found then return jsonb_build_object('lead',case when l.deleted_at is null then to_jsonb(l)-'deleted_at' else null end,'matched',true,'duplicate',true);end if;
  if (select count(*) from public.radar_leads where user_id=u)>=10000 or (select count(*) from public.radar_leads where user_id=u and scope=p_scope)>=2000 then raise exception 'Radar inbox capacity reached' using errcode='22023';end if;
  insert into public.radar_leads(user_id,scope,group_id,group_identity,group_name,post_id,url,author,text,matched_keywords,post_created_at)
  values(u,p_scope,g.id,g.identity,g.title,p_payload->>'post_id','https://www.facebook.com/groups/'||g.identity||'/posts/'||(p_payload->>'post_id')||'/',p_payload->>'author',p_payload->>'text',matches,(p_payload->>'post_created_at')::timestamptz) returning * into l;
  return jsonb_build_object('lead',to_jsonb(l)-'deleted_at','matched',true,'duplicate',false);
 elsif p_operation in('update_lead','delete_lead') then
  select * into l from public.radar_leads where id=(p_payload->>'id')::uuid and user_id=u and scope=p_scope and deleted_at is null for update;
  if not found then raise exception 'Lead unavailable' using errcode='42501';end if;
  if l.revision is distinct from p_revision then raise exception 'Lead changed; reload' using errcode='PT409';end if;
  if p_operation='delete_lead' then
   if p_payload-array['id']::text[]<>'{}'::jsonb then raise exception 'Invalid deletion' using errcode='22023';end if;
   update public.radar_leads set deleted_at=now(),author='',text='',note='',matched_keywords='[]',revision=revision+1,updated_at=now() where id=l.id;return jsonb_build_object('deleted',1);
  end if;
  value:=p_payload->'changes';
  if p_payload-array['id','changes']::text[]<>'{}'::jsonb or jsonb_typeof(value) is distinct from 'object' or value='{}'::jsonb or value-array['stage','is_read','is_starred','note']::text[]<>'{}'::jsonb or value?'stage' and coalesce(value->>'stage','') not in('new','replied','conversation','customer','closed') or value?'is_read' and jsonb_typeof(value->'is_read') is distinct from 'boolean' or value?'is_starred' and jsonb_typeof(value->'is_starred') is distinct from 'boolean' or value?'note' and (jsonb_typeof(value->'note') is distinct from 'string' or char_length(value->>'note')>2000) then raise exception 'Check lead changes' using errcode='22023';end if;
  update public.radar_leads set stage=coalesce(value->>'stage',stage),is_read=coalesce((value->>'is_read')::boolean,is_read),is_starred=coalesce((value->>'is_starred')::boolean,is_starred),note=coalesce(value->>'note',note),revision=revision+1,updated_at=now() where id=l.id returning * into l;return jsonb_build_object('lead',to_jsonb(l)-'deleted_at');
 elsif p_operation='clear' then
  if p_payload-array['before']::text[]<>'{}'::jsonb or jsonb_typeof(p_payload->'before') is distinct from 'string' or (p_payload->>'before')::timestamptz>now()+interval '5 seconds' then raise exception 'Check clear boundary' using errcode='22023';end if;
  update public.radar_leads set deleted_at=now(),author='',text='',note='',matched_keywords='[]',revision=revision+1,updated_at=now() where user_id=u and scope=p_scope and deleted_at is null and discovered_at<=(p_payload->>'before')::timestamptz;get diagnostics count_deleted=row_count;return jsonb_build_object('deleted',count_deleted);
 end if;
 raise exception 'Unknown Radar operation' using errcode='22023';
end $$;
revoke all on function staysuite_radar_private.command(text,integer,text,jsonb) from public,anon,authenticated;
grant usage on schema staysuite_radar_private to authenticated;grant execute on function staysuite_radar_private.command(text,integer,text,jsonb) to authenticated;
create function public.radar_command(p_scope text,p_revision integer,p_operation text,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select staysuite_radar_private.command(p_scope,p_revision,p_operation,p_payload)$$;
revoke all on function public.radar_command(text,integer,text,jsonb) from public,anon,authenticated;grant execute on function public.radar_command(text,integer,text,jsonb) to authenticated;
notify pgrst,'reload schema';
