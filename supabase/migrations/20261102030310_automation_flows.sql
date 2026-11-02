-- Reference Trigger/Post/Wait/Loop/Stop execution. Uses the existing guarded publisher.
create function public.automation_definition_valid(d jsonb) returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare s jsonb;ids uuid[]:='{}';jobs uuid[]:='{}';one uuid[];i integer:=0;target integer;has_post boolean:=false;
begin
 if jsonb_typeof(d)<>'object' or d-array['version','steps']::text[]<>'{}'::jsonb or d->'version' is distinct from '1'::jsonb or jsonb_typeof(d->'steps') is distinct from 'array' or jsonb_array_length(d->'steps') not between 2 and 30 then return false;end if;
 for s in select value from jsonb_array_elements(d->'steps') loop
  if jsonb_typeof(s)<>'object' or jsonb_typeof(s->'id') is distinct from 'string' or (s->>'id')::uuid=any(ids) then return false;end if;ids:=array_append(ids,(s->>'id')::uuid);
  if (i=0 and s->>'type' is distinct from 'trigger') or(i>0 and s->>'type'='trigger') then return false;end if;
  case s->>'type'
   when 'trigger' then if s-array['id','type','cadence']::text[]<>'{}'::jsonb or not(s?'cadence') or(s->'cadence'<>'null'::jsonb and not public.schedule_cadence_valid(s->'cadence')) then return false;end if;
   when 'post' then
    if s-array['id','type','campaign_ids']::text[]<>'{}'::jsonb or jsonb_typeof(s->'campaign_ids') is distinct from 'array' or jsonb_array_length(s->'campaign_ids') not between 1 and 10 then return false;end if;
    select array_agg(x::uuid) into one from jsonb_array_elements_text(s->'campaign_ids') a(x);
    if cardinality(one)<>(select count(distinct x) from unnest(one) a(x)) then return false;end if;jobs:=jobs||one;has_post:=true;
   when 'wait' then if s-array['id','type','minutes']::text[]<>'{}'::jsonb or jsonb_typeof(s->'minutes') is distinct from 'number' or (s->>'minutes')::numeric<>trunc((s->>'minutes')::numeric) or(s->>'minutes')::int not between 1 and 525600 then return false;end if;
   when 'loop' then
    if s-array['id','type','target_id','max_loops']::text[]<>'{}'::jsonb or jsonb_typeof(s->'target_id') is distinct from 'string' or not(s?'max_loops') or(s->'max_loops'<>'null'::jsonb and(jsonb_typeof(s->'max_loops') is distinct from 'number' or(s->>'max_loops')::numeric<>trunc((s->>'max_loops')::numeric) or(s->>'max_loops')::int not between 1 and 1000)) then return false;end if;
    target:=array_position(ids,(s->>'target_id')::uuid)-1;
    if target is null or target>=i or not exists(select 1 from jsonb_array_elements(d->'steps') with ordinality a(v,n) where n>target and n<=i and v->>'type'='wait') then return false;end if;
   when 'stop' then if s-array['id','type']::text[]<>'{}'::jsonb then return false;end if;
   else return false;
  end case;i:=i+1;
 end loop;
 return has_post and(select count(distinct x) from unnest(jobs) a(x))<=50;
exception when others then return false;
end $$;
revoke all on function public.automation_definition_valid(jsonb) from public,anon,authenticated;grant execute on function public.automation_definition_valid(jsonb) to authenticated;
create table public.automation_flows(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,title text not null check(char_length(btrim(title)) between 1 and 120),definition jsonb not null check(public.automation_definition_valid(definition)),
 state text not null default 'paused' check(state in('paused','enabled','blocked','completed')),revision integer not null default 1 check(revision>0),approved_digest text,actor_id text check(actor_id is null or actor_id~'^[1-9][0-9]{0,79}$'),actor_type text check(actor_type in('personal','page')),
 step_index integer not null default 0 check(step_index>=0),post_index integer not null default 0 check(post_index>=0),loop_counters jsonb not null default '{}' check(jsonb_typeof(loop_counters)='object'),next_action_at timestamptz,wait_until timestamptz,occurrence_at timestamptz,cycle_started_at timestamptz,cycle integer not null default 0 check(cycle>=0),current_schedule_id uuid,stop_reason text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,user_id)
);
create index automation_flows_owner on public.automation_flows(user_id,created_at desc);
create index automation_flows_actor on public.automation_flows(user_id,actor_id,actor_type) where state='enabled' or current_schedule_id is not null;
alter table public.campaign_schedules add column automation_flow_id uuid;
alter table public.campaign_schedules add constraint schedule_flow_owner foreign key(automation_flow_id,user_id) references public.automation_flows(id,user_id) on delete cascade;
create index campaign_schedules_flow on public.campaign_schedules(automation_flow_id,user_id) where automation_flow_id is not null;
alter table public.automation_flows add constraint flow_current_schedule foreign key(current_schedule_id) references public.campaign_schedules(id) on delete set null;
create index automation_flows_current_schedule on public.automation_flows(current_schedule_id) where current_schedule_id is not null;
create table public.automation_flow_posts(
 flow_id uuid not null,user_id uuid not null,campaign_id uuid not null unique references public.campaign_jobs(id) on delete cascade,
 primary key(flow_id,campaign_id),foreign key(flow_id,user_id) references public.automation_flows(id,user_id) on delete cascade
);
create index automation_flow_posts_owner on public.automation_flow_posts(user_id,flow_id);
create table public.automation_flow_events(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,flow_id uuid references public.automation_flows(id) on delete set null,flow_title text not null,flow_revision integer not null,cycle integer not null,
 kind text not null check(kind in('saved','enabled','paused','trigger','post_started','post_completed','wait_started','wait_completed','loop','stop','cycle_completed','completed','missed','blocked')),step_id uuid,details jsonb not null default '{}' check(jsonb_typeof(details)='object' and octet_length(details::text)<=131072),created_at timestamptz not null default now(),unique(flow_id,flow_revision)
);
create index automation_flow_events_owner on public.automation_flow_events(user_id,created_at desc,id desc);
create index automation_flow_events_flow on public.automation_flow_events(flow_id,user_id,created_at desc);
alter table public.automation_flows enable row level security;alter table public.automation_flows force row level security;
alter table public.automation_flow_posts enable row level security;alter table public.automation_flow_posts force row level security;
alter table public.automation_flow_events enable row level security;alter table public.automation_flow_events force row level security;
revoke all on public.automation_flows,public.automation_flow_posts,public.automation_flow_events from public,anon,authenticated;
grant select on public.automation_flows,public.automation_flow_posts,public.automation_flow_events to authenticated;
create policy automation_flows_owner_read on public.automation_flows for select to authenticated using(user_id=(select auth.uid()));
create policy automation_posts_owner_read on public.automation_flow_posts for select to authenticated using(user_id=(select auth.uid()));
create policy automation_events_owner_read on public.automation_flow_events for select to authenticated using(user_id=(select auth.uid()));
create schema staysuite_flow_private;revoke all on schema staysuite_flow_private from public,anon,authenticated;
create function staysuite_flow_private.digest(p_id uuid) returns text language sql stable security invoker set search_path='' as $$
 with f as(select * from public.automation_flows where id=p_id and user_id=auth.uid()),refs as(select distinct x::uuid id from f,jsonb_array_elements(f.definition->'steps') a(s),lateral jsonb_array_elements_text(case when s->>'type'='post' then s->'campaign_ids' else '[]' end) b(x)),data as(select count(*) total,count(c.id) available,jsonb_agg(jsonb_build_array(r.id,staysuite_campaign_private.snapshot(c.id)) order by r.id) jobs from refs r left join public.campaign_jobs c on c.id=r.id and c.user_id=auth.uid())
 select case when data.total=data.available and data.total>0 then encode(sha256(convert_to(jsonb_build_object('title',f.title,'definition',f.definition,'jobs',data.jobs)::text,'UTF8')),'hex') else null end from f,data
$$;
revoke all on function staysuite_flow_private.digest(uuid) from public,anon,authenticated;
create function staysuite_flow_private.event(p_id uuid,p_kind text,p_step uuid default null,p_details jsonb default '{}') returns void language plpgsql security invoker set search_path='' as $$
begin
 insert into public.automation_flow_events(user_id,flow_id,flow_title,flow_revision,cycle,kind,step_id,details) select user_id,id,title,revision,cycle,p_kind,p_step,p_details from public.automation_flows where id=p_id and user_id=auth.uid();
 delete from public.automation_flow_events where id in(select id from public.automation_flow_events where user_id=auth.uid() order by created_at desc,id desc offset 5000);
end $$;
revoke all on function staysuite_flow_private.event(uuid,text,uuid,jsonb) from public,anon,authenticated;
-- A private child's submission history, not its job state alone, controls advancement.
create function staysuite_flow_private.reconcile(p_id uuid) returns void language plpgsql security invoker set search_path='' as $$
declare f public.automation_flows;s public.campaign_schedules;c public.campaign_jobs;r public.campaign_schedule_runs;step jsonb;kind text;
begin
 select * into f from public.automation_flows where id=p_id and user_id=auth.uid() for update;if f.current_schedule_id is null then return;end if;
 select * into s from public.campaign_schedules where id=f.current_schedule_id and user_id=f.user_id for update;
 if not found then update public.automation_flows set state='blocked',current_schedule_id=null,stop_reason='Post schedule is missing; review required',revision=revision+1,updated_at=now() where id=f.id;perform staysuite_flow_private.event(f.id,'blocked');return;end if;
 select * into c from public.campaign_jobs where id=s.campaign_id and user_id=f.user_id for update;
 if c.state='running' then return;end if;
 if c.state='paused' then if f.state='enabled' then update public.automation_flows set state='blocked',stop_reason='Current post paused; resume explicitly',revision=revision+1,updated_at=now() where id=f.id;perform staysuite_flow_private.event(f.id,'blocked');end if;return;end if;
 if s.current_run_id is not null and c.state in('completed','blocked','cancelled') then
  perform staysuite_schedule_private.schedule_command(s.id,s.revision,'pause','{}');select * into s from public.campaign_schedules where id=s.id;
 end if;
 select * into r from public.campaign_schedule_runs where schedule_id=s.id and user_id=f.user_id order by scheduled_at desc,id desc limit 1;
 if r.id is null and s.state not in('blocked','completed') then return;end if;
 if r.state='running' then return;end if;
 step:=f.definition->'steps'->f.step_index;
 perform staysuite_schedule_private.schedule_command(s.id,s.revision,'delete','{}');
 if r.state='completed' then
  update public.automation_flows set current_schedule_id=null,post_index=case when f.post_index+1<jsonb_array_length(step->'campaign_ids') then f.post_index+1 else 0 end,step_index=case when f.post_index+1<jsonb_array_length(step->'campaign_ids') then f.step_index else f.step_index+1 end,next_action_at=now(),revision=revision+1,updated_at=now() where id=f.id;
  perform staysuite_flow_private.event(f.id,'post_completed',(step->>'id')::uuid,jsonb_build_object('campaign_id',c.id,'run_id',r.id,'outcomes',r.outcomes));
 else
  update public.automation_flows set current_schedule_id=null,state='blocked',stop_reason=case when r.state='missed' then 'Post start was missed; review before restarting' else 'Submission needs review; no automatic retry' end,revision=revision+1,updated_at=now() where id=f.id;
  perform staysuite_flow_private.event(f.id,case when r.state='missed' then 'missed' else 'blocked' end,(step->>'id')::uuid,jsonb_build_object('campaign_id',c.id,'run_id',r.id,'outcomes',r.outcomes));
 end if;
end $$;
revoke all on function staysuite_flow_private.reconcile(uuid) from public,anon,authenticated;
create function staysuite_flow_private.tick(p_actor jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare f public.automation_flows;step jsonb;c public.campaign_jobs;cadence jsonb;at_time timestamptz;child uuid;child_row public.campaign_schedules;counter integer;target integer;limit_steps integer;fail text;u uuid:=auth.uid();
begin
 if u is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Sign in required' using errcode='42501';end if;
 if p_actor is null or p_actor-array['actor_id','actor_type']::text[]<>'{}'::jsonb or coalesce(p_actor->>'actor_id','')!~'^[1-9][0-9]{0,79}$' or coalesce(p_actor->>'actor_type','') not in('personal','page') then raise exception 'Choose a current actor' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('schedule-owner:'||u::text,0));perform pg_advisory_xact_lock(hashtextextended('flow-owner:'||u::text,0));
 for f in select * from public.automation_flows where user_id=u and actor_id=p_actor->>'actor_id' and actor_type=p_actor->>'actor_type' and(state='enabled' or current_schedule_id is not null) order by next_action_at nulls last,id for update loop
  perform staysuite_flow_private.reconcile(f.id);select * into f from public.automation_flows where id=f.id;
  if f.state<>'enabled' then continue;end if;
  if f.approved_digest is distinct from staysuite_flow_private.digest(f.id) then
   if f.current_schedule_id is not null then select * into child_row from public.campaign_schedules where id=f.current_schedule_id;perform staysuite_schedule_private.schedule_command(child_row.id,child_row.revision,'pause','{}');end if;
   update public.automation_flows set state='blocked',stop_reason='Content, targets, resources or settings changed; review again',revision=revision+1,updated_at=now() where id=f.id;perform staysuite_flow_private.event(f.id,'blocked');continue;
  end if;
  if f.current_schedule_id is not null or f.next_action_at>now() then continue;end if;
  begin
   for limit_steps in 1..32 loop
    select * into f from public.automation_flows where id=f.id;
    if f.state<>'enabled' or f.current_schedule_id is not null or f.next_action_at>now() then exit;end if;
    if f.step_index>=jsonb_array_length(f.definition->'steps') then
     cadence:=f.definition->'steps'->0->'cadence';at_time:=case when cadence='null'::jsonb then null else public.schedule_next(cadence,greatest(now(),f.occurrence_at)) end;
     update public.automation_flows set state=case when at_time is null then 'completed' else 'enabled' end,step_index=0,post_index=0,loop_counters='{}',next_action_at=at_time,wait_until=null,cycle_started_at=null,stop_reason=null,revision=revision+1,updated_at=now() where id=f.id;
     perform staysuite_flow_private.event(f.id,case when at_time is null then 'completed' else 'cycle_completed' end);exit;
    end if;
    step:=f.definition->'steps'->f.step_index;
    case step->>'type'
     when 'trigger' then
      if f.step_index=0 and f.cycle_started_at is null then
       if f.next_action_at<now()-interval '15 minutes' then
        cadence:=step->'cadence';at_time:=case when cadence='null'::jsonb then null else public.schedule_next(cadence,now()) end;
        update public.automation_flows set state=case when at_time is null then 'blocked' else 'enabled' end,next_action_at=at_time,stop_reason='Start missed; no catch-up burst',revision=revision+1,updated_at=now() where id=f.id;perform staysuite_flow_private.event(f.id,'missed',(step->>'id')::uuid);exit;
       end if;
       update public.automation_flows set cycle=cycle+1,cycle_started_at=now(),occurrence_at=next_action_at,step_index=step_index+1,next_action_at=now(),revision=revision+1,updated_at=now() where id=f.id;
      else update public.automation_flows set step_index=step_index+1,next_action_at=now(),revision=revision+1,updated_at=now() where id=f.id;end if;
      perform staysuite_flow_private.event(f.id,'trigger',(step->>'id')::uuid);
     when 'wait' then
      if f.wait_until is not null then
       update public.automation_flows set step_index=step_index+1,next_action_at=now(),wait_until=null,stop_reason=null,revision=revision+1,updated_at=now() where id=f.id;perform staysuite_flow_private.event(f.id,'wait_completed',(step->>'id')::uuid);
      else update public.automation_flows set next_action_at=now()+make_interval(mins=>(step->>'minutes')::int),wait_until=now()+make_interval(mins=>(step->>'minutes')::int),stop_reason='Waiting',revision=revision+1,updated_at=now() where id=f.id;perform staysuite_flow_private.event(f.id,'wait_started',(step->>'id')::uuid,jsonb_build_object('minutes',step->'minutes'));exit;end if;
     when 'loop' then
      counter:=coalesce((f.loop_counters->>(step->>'id'))::int,0);select ordinality-1 into target from jsonb_array_elements(f.definition->'steps') with ordinality a(v,ordinality) where(v->>'id')::uuid=(step->>'target_id')::uuid;
      update public.automation_flows set step_index=case when step->'max_loops'='null'::jsonb or counter<(step->>'max_loops')::int-1 then target else f.step_index+1 end,loop_counters=jsonb_set(loop_counters,array[step->>'id'],to_jsonb(case when step->'max_loops'='null'::jsonb or counter<(step->>'max_loops')::int-1 then counter+1 else 0 end)),next_action_at=now(),stop_reason=null,revision=revision+1,updated_at=now() where id=f.id;perform staysuite_flow_private.event(f.id,'loop',(step->>'id')::uuid);
     when 'stop' then update public.automation_flows set state='completed',next_action_at=null,stop_reason='Stop step',revision=revision+1,updated_at=now() where id=f.id;perform staysuite_flow_private.event(f.id,'stop',(step->>'id')::uuid);exit;
     when 'post' then
      select * into c from public.campaign_jobs where id=(step->'campaign_ids'->>f.post_index)::uuid and user_id=u for update;
      if not found or c.actor_id is distinct from f.actor_id or c.actor_type is distinct from f.actor_type or c.approved_digest is distinct from staysuite_campaign_private.snapshot(c.id) or not staysuite_campaign_private.rules_ready(c.id) then raise exception 'Post approval changed' using errcode='55000';end if;
      child:=gen_random_uuid();cadence:=jsonb_build_object('frequency','once','starts_at',now()+interval '1 second','interval',1,'weekdays','[]'::jsonb,'month_days','[]'::jsonb,'ends_at',null);
      perform staysuite_schedule_private.schedule_command(child,c.revision,'create',jsonb_build_object('campaign_id',c.id,'cadence',cadence));
      update public.campaign_schedules set automation_flow_id=f.id where id=child;
      update public.automation_flows set current_schedule_id=child,next_action_at=null,stop_reason=null,revision=revision+1,updated_at=now() where id=f.id;
      perform staysuite_schedule_private.schedule_command(child,1,'enable','{"reviewed":true}');
      perform staysuite_flow_private.event(f.id,'post_started',(step->>'id')::uuid,jsonb_build_object('campaign_id',c.id,'schedule_id',child,'title',c.title,'plan',c.plan,'actor_id',c.actor_id,'actor_type',c.actor_type));exit;
     else raise exception 'Invalid automation step' using errcode='22023';
    end case;
   end loop;
  exception when others then get stacked diagnostics fail=returned_sqlstate;update public.automation_flows set state='blocked',stop_reason='Post preparation or publishing validation requires review',revision=revision+1,updated_at=now() where id=f.id;perform staysuite_flow_private.event(f.id,'blocked',null,jsonb_build_object('code',fail));
  end;
 end loop;
end $$;
revoke all on function staysuite_flow_private.tick(jsonb) from public,anon,authenticated;
create function staysuite_flow_private.command(p_id uuid,p_revision integer,p_operation text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();f public.automation_flows;c public.campaign_jobs;s public.campaign_schedules;ids uuid[];v_digest text;cadence jsonb;at_time timestamptz;row_digest text;
begin
 if u is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Sign in required' using errcode='42501';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>64000 then raise exception 'Invalid automation command' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('schedule-owner:'||u::text,0));perform pg_advisory_xact_lock(hashtextextended('flow-owner:'||u::text,0));
 if p_operation='create' then
  if p_revision is distinct from 0 then raise exception 'Invalid creation revision' using errcode='PT409';end if;
  if(select count(*) from public.automation_flows where user_id=u)>=50 then raise exception 'Automation capacity reached' using errcode='22023';end if;
 else
  select * into f from public.automation_flows where id=p_id and user_id=u for update;if not found then raise exception 'Automation unavailable' using errcode='42501';end if;
  if f.revision is distinct from p_revision then raise exception 'Automation changed; reload' using errcode='PT409';end if;
  perform staysuite_flow_private.reconcile(f.id);select * into f from public.automation_flows where id=f.id;
 end if;
 if p_operation in('create','save') then
  if p_payload-array['title','definition']::text[]<>'{}'::jsonb or jsonb_typeof(p_payload->'title') is distinct from 'string' or char_length(btrim(p_payload->>'title')) not between 1 and 120 or not public.automation_definition_valid(p_payload->'definition') then raise exception 'Check automation blocks and title' using errcode='22023';end if;
  if f.state='enabled' then raise exception 'Pause before editing' using errcode='55000';end if;
  if f.current_schedule_id is not null then
   select * into s from public.campaign_schedules where id=f.current_schedule_id and user_id=u for update;
   if s.current_run_id is not null or exists(select 1 from public.campaign_schedule_runs where schedule_id=s.id) then raise exception 'Resolve the current submission first' using errcode='55000';end if;
   perform staysuite_schedule_private.schedule_command(s.id,s.revision,'delete','{}');f.current_schedule_id:=null;
  end if;
  select array_agg(distinct x::uuid) into ids from jsonb_array_elements(p_payload->'definition'->'steps') a(step),lateral jsonb_array_elements_text(case when step->>'type'='post' then step->'campaign_ids' else '[]'::jsonb end) b(x);
  if(select count(*) from public.campaign_jobs where user_id=u and id=any(ids))<>cardinality(ids) then raise exception 'Post is unavailable to this account' using errcode='42501';end if;
  if exists(select 1 from public.automation_flow_posts where campaign_id=any(ids) and flow_id<>p_id) or exists(select 1 from public.campaign_schedules where campaign_id=any(ids)) or exists(select 1 from public.campaign_jobs where id=any(ids) and state='running') then raise exception 'Use posts that are not scheduled or assigned to another automation' using errcode='55000';end if;
  if p_operation='create' then insert into public.automation_flows(id,user_id,title,definition) values(p_id,u,btrim(p_payload->>'title'),p_payload->'definition') returning * into f;
  else update public.automation_flows set title=btrim(p_payload->>'title'),definition=p_payload->'definition',state='paused',approved_digest=null,actor_id=null,actor_type=null,step_index=0,post_index=0,loop_counters='{}',next_action_at=null,wait_until=null,cycle_started_at=null,occurrence_at=null,stop_reason='Changed; review before enabling',revision=revision+1,updated_at=now() where id=f.id returning * into f;delete from public.automation_flow_posts where flow_id=f.id and user_id=u;end if;
  insert into public.automation_flow_posts(flow_id,user_id,campaign_id) select f.id,u,x from unnest(ids) a(x);
  perform staysuite_flow_private.event(f.id,'saved');
 elsif p_operation='enable' then
  if p_payload-array['reviewed','digest','actor_id','actor_type']::text[]<>'{}'::jsonb or p_payload->'reviewed' is distinct from 'true'::jsonb or coalesce(p_payload->>'actor_id','')!~'^[1-9][0-9]{0,79}$' or coalesce(p_payload->>'actor_type','') not in('personal','page') then raise exception 'Review the exact automation' using errcode='22023';end if;
  if f.state='enabled' then raise exception 'Automation already enabled' using errcode='55000';end if;
  v_digest:=staysuite_flow_private.digest(f.id);if v_digest is null or p_payload->>'digest' is distinct from v_digest then raise exception 'Content or resources changed; reload review' using errcode='PT409';end if;
  for c in select job_row.* from public.campaign_jobs job_row join public.automation_flow_posts b on b.campaign_id=job_row.id where b.flow_id=f.id and job_row.user_id=u order by job_row.id for update of job_row loop
   if c.actor_id is distinct from p_payload->>'actor_id' or c.actor_type is distinct from p_payload->>'actor_type' or c.settings->>'method'<>'direct' or exists(select 1 from jsonb_array_elements(c.plan->'media') a(m) where m->>'type' like 'video/%') or not staysuite_campaign_private.rules_ready(c.id) or not public.campaign_direct_publisher_ready(c.actor_id) then raise exception 'Review groups and validate the current Direct profile first' using errcode='55000';end if;
   row_digest:=staysuite_campaign_private.snapshot(c.id);
   if c.state in('paused','running') then
    if f.current_schedule_id is null or not exists(select 1 from public.campaign_schedules where id=f.current_schedule_id and campaign_id=c.id and current_run_id is not null) or c.approved_digest is distinct from row_digest then raise exception 'Resolve the post before enabling' using errcode='55000';end if;
   elsif c.state in('draft','needs_review','ready','completed') then
    if c.approved_digest is distinct from row_digest then perform public.campaign_command(c.id,c.revision,'approve',jsonb_build_object('digest',row_digest));end if;
    if not exists(select 1 from public.campaign_jobs j where j.id=c.id and j.approved_digest=row_digest and j.state in('ready','completed')) then raise exception 'Post media or approval is not ready' using errcode='55000';end if;
   else raise exception 'Review earlier submission outcomes first' using errcode='55000';end if;
  end loop;
  cadence:=f.definition->'steps'->0->'cadence';
  if f.cycle_started_at is null or f.state='completed' then
   at_time:=case when cadence='null'::jsonb then now() else public.schedule_next(cadence,now()) end;if at_time is null then raise exception 'Choose a future trigger occurrence' using errcode='22023';end if;
   update public.automation_flows set step_index=0,post_index=0,loop_counters='{}',wait_until=null,cycle_started_at=null,next_action_at=at_time where id=f.id;
  end if;
  update public.automation_flows set state='enabled',approved_digest=v_digest,actor_id=p_payload->>'actor_id',actor_type=p_payload->>'actor_type',stop_reason=case when wait_until is not null then 'Waiting' else null end,revision=revision+1,updated_at=now() where id=f.id returning * into f;
  if f.current_schedule_id is not null then
   select * into s from public.campaign_schedules where id=f.current_schedule_id and user_id=u for update;
   if s.current_run_id is null then cadence:=jsonb_build_object('frequency','once','starts_at',now()+interval '1 second','interval',1,'weekdays','[]'::jsonb,'month_days','[]'::jsonb,'ends_at',null);perform staysuite_schedule_private.schedule_command(s.id,s.revision,'update',jsonb_build_object('cadence',cadence));select * into s from public.campaign_schedules where id=s.id;end if;
   perform staysuite_schedule_private.schedule_command(s.id,s.revision,'enable','{"reviewed":true}');
  end if;
  perform staysuite_flow_private.event(f.id,'enabled');
 elsif p_operation='pause' then
  if p_payload<>'{}'::jsonb then raise exception 'Invalid pause command' using errcode='22023';end if;
  if f.current_schedule_id is not null then select * into s from public.campaign_schedules where id=f.current_schedule_id and user_id=u for update;perform staysuite_schedule_private.schedule_command(s.id,s.revision,'pause','{}');end if;
  update public.automation_flows set state='paused',stop_reason='Paused by you',revision=revision+1,updated_at=now() where id=f.id returning * into f;perform staysuite_flow_private.event(f.id,'paused');
 elsif p_operation='delete' then
  if p_payload<>'{}'::jsonb or f.state='enabled' then raise exception 'Pause before deleting' using errcode='55000';end if;
  if f.current_schedule_id is not null then select * into s from public.campaign_schedules where id=f.current_schedule_id and user_id=u for update;if s.current_run_id is not null or exists(select 1 from public.campaign_schedule_runs where schedule_id=s.id) then raise exception 'Resolve current submission first' using errcode='55000';end if;perform staysuite_schedule_private.schedule_command(s.id,s.revision,'delete','{}');end if;
  delete from public.automation_flows where id=f.id;return jsonb_build_object('flow',null,'deleted_id',f.id);
 else raise exception 'Unknown automation command' using errcode='22023';end if;
 select * into f from public.automation_flows where id=p_id and user_id=u;
 return jsonb_build_object('flow',to_jsonb(f)||jsonb_build_object('digest',staysuite_flow_private.digest(f.id)));
end $$;
revoke all on function staysuite_flow_private.command(uuid,integer,text,jsonb) from public,anon,authenticated;
create function staysuite_flow_private.snapshot(p_id uuid default null,p_history boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid();rows jsonb;events jsonb;
begin
 if u is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Sign in required' using errcode='42501';end if;
 if p_history then
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id desc),'[]') into events from(select * from public.automation_flow_events where user_id=u and(p_id is null or flow_id=p_id) order by created_at desc,id desc limit 20)e;rows:='[]';
 else
  if p_id is not null and not exists(select 1 from public.automation_flows where id=p_id and user_id=u) then raise exception 'Automation unavailable' using errcode='42501';end if;
  select coalesce(jsonb_agg(to_jsonb(f)||case when p_id is not null then jsonb_build_object('digest',staysuite_flow_private.digest(f.id)) else '{}'::jsonb end order by f.created_at desc,f.id),'[]') into rows from public.automation_flows f where f.user_id=u and(p_id is null or f.id=p_id);events:='[]';
 end if;
 return jsonb_build_object('viewer_id',u,'flows',rows,'events',events);
end $$;
revoke all on function staysuite_flow_private.snapshot(uuid,boolean) from public,anon,authenticated;
grant usage on schema staysuite_flow_private to authenticated;
grant execute on function staysuite_flow_private.command(uuid,integer,text,jsonb),staysuite_flow_private.snapshot(uuid,boolean) to authenticated;
create function public.automation_flow_command(p_id uuid,p_revision integer,p_operation text,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select staysuite_flow_private.command(p_id,p_revision,p_operation,p_payload)$$;
create function public.automation_flow_snapshot(p_id uuid default null,p_history boolean default false) returns jsonb language sql security invoker set search_path='' as $$select staysuite_flow_private.snapshot(p_id,p_history)$$;
revoke all on function public.automation_flow_command(uuid,integer,text,jsonb),public.automation_flow_snapshot(uuid,boolean) from public,anon,authenticated;
grant execute on function public.automation_flow_command(uuid,integer,text,jsonb),public.automation_flow_snapshot(uuid,boolean) to authenticated;
-- All externally callable campaign/schedule operations keep their prior gates and
-- add flow-position checks. The legacy cores cannot be executed by clients.
alter function public.campaign_command(uuid,integer,text,jsonb) set schema staysuite_flow_private;
alter function staysuite_flow_private.campaign_command(uuid,integer,text,jsonb) rename to campaign_command_core;
revoke all on function staysuite_flow_private.campaign_command_core(uuid,integer,text,jsonb),staysuite_schedule_private.schedule_command(uuid,integer,text,jsonb) from public,anon,authenticated;
create function staysuite_flow_private.campaign_gate(p_id uuid,p_revision integer,p_command text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();f public.automation_flows;s public.campaign_schedules;
begin
 if u is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Sign in required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('schedule-owner:'||u::text,0));
 if p_command<>'create' and not exists(select 1 from public.campaign_jobs where id=p_id and user_id=u) then raise exception 'Campaign unavailable' using errcode='42501';end if;
 select a.* into f from public.automation_flows a join public.automation_flow_posts b on b.flow_id=a.id where b.campaign_id=p_id and a.user_id=u;
 if f.id is not null and p_command in('start','resume','claim') then
  select * into s from public.campaign_schedules where id=f.current_schedule_id and campaign_id=p_id and user_id=u;
  if f.state<>'enabled' or s.id is null or s.current_run_id is null or f.approved_digest is distinct from staysuite_flow_private.digest(f.id) then raise exception 'This post waits for its approved automation step' using errcode='55000';end if;
 end if;
 if f.id is not null and p_command='validate_one' and(f.state='enabled' or f.current_schedule_id is not null) then raise exception 'Pause and resolve the automation before validation' using errcode='55000';end if;
 return staysuite_flow_private.campaign_command_core(p_id,p_revision,p_command,p_payload);
end $$;
revoke all on function staysuite_flow_private.campaign_gate(uuid,integer,text,jsonb) from public,anon,authenticated;grant execute on function staysuite_flow_private.campaign_gate(uuid,integer,text,jsonb) to authenticated;
create function public.campaign_command(p_id uuid,p_revision integer,p_command text,p_payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select staysuite_flow_private.campaign_gate(p_id,p_revision,p_command,p_payload)$$;
revoke all on function public.campaign_command(uuid,integer,text,jsonb) from public,anon,authenticated;grant execute on function public.campaign_command(uuid,integer,text,jsonb) to authenticated;
create function staysuite_flow_private.schedule_gate(p_id uuid,p_revision integer,p_operation text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Sign in required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('schedule-owner:'||u::text,0));
 if p_operation='tick' then perform staysuite_flow_private.tick(p_payload);
 elsif exists(select 1 from public.campaign_schedules where id=p_id and user_id=u and automation_flow_id is not null) or(p_operation='create' and exists(select 1 from public.automation_flow_posts where campaign_id=(p_payload->>'campaign_id')::uuid and user_id=u)) then raise exception 'Manage this post through its automation' using errcode='55000';end if;
 return staysuite_schedule_private.schedule_command(p_id,p_revision,p_operation,p_payload);
end $$;
revoke all on function staysuite_flow_private.schedule_gate(uuid,integer,text,jsonb) from public,anon,authenticated;grant execute on function staysuite_flow_private.schedule_gate(uuid,integer,text,jsonb) to authenticated;
create or replace function public.schedule_command(p_id uuid,p_revision integer,p_operation text,p_payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select staysuite_flow_private.schedule_gate(p_id,p_revision,p_operation,p_payload)$$;
-- Deleting an active automation's post must not orphan a live submission.
alter function public.campaign_delete(uuid,integer,boolean) set schema staysuite_flow_private;
alter function staysuite_flow_private.campaign_delete(uuid,integer,boolean) rename to campaign_delete_core;
revoke all on function staysuite_flow_private.campaign_delete_core(uuid,integer,boolean) from public,anon,authenticated;
create function staysuite_flow_private.delete_gate(p_id uuid,p_revision integer,p_finish boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Sign in required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('schedule-owner:'||u::text,0));
 if exists(select 1 from public.automation_flow_posts b join public.automation_flows f on f.id=b.flow_id where b.campaign_id=p_id and f.user_id=u and(f.state='enabled' or f.current_schedule_id is not null)) then raise exception 'Pause and resolve the automation before deleting its post' using errcode='55000';end if;
 return staysuite_flow_private.campaign_delete_core(p_id,p_revision,p_finish);
end $$;
revoke all on function staysuite_flow_private.delete_gate(uuid,integer,boolean) from public,anon,authenticated;grant execute on function staysuite_flow_private.delete_gate(uuid,integer,boolean) to authenticated;
create function public.campaign_delete(p_id uuid,p_revision integer,p_finish boolean default false) returns jsonb language sql security invoker set search_path='' as $$select staysuite_flow_private.delete_gate(p_id,p_revision,p_finish)$$;
revoke all on function public.campaign_delete(uuid,integer,boolean) from public,anon,authenticated;grant execute on function public.campaign_delete(uuid,integer,boolean) to authenticated;
notify pgrst,'reload schema';
