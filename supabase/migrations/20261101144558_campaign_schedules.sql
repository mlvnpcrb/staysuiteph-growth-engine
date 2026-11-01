-- Add owner-scoped scheduled runs; existing publisher and receipt checks stay in force.
create function public.schedule_cadence_valid(c jsonb) returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare n jsonb; seen integer[]; start_at timestamptz; finish_at timestamptz; freq text;
begin
 if jsonb_typeof(c)<>'object' or c-array['frequency','starts_at','interval','weekdays','month_days','ends_at']::text[]<>'{}'::jsonb or not(c ?& array['frequency','starts_at','interval','weekdays','month_days','ends_at']) then return false; end if;
 freq:=c->>'frequency'; if coalesce(freq,'') not in ('once','daily','weekly','monthly') then return false; end if;
 if jsonb_typeof(c->'starts_at')<>'string' or (c->>'starts_at') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then return false; end if;
 start_at:=(c->>'starts_at')::timestamptz; if not isfinite(start_at) then return false; end if;
 if c->'ends_at'<>'null'::jsonb then
  if jsonb_typeof(c->'ends_at')<>'string' or (c->>'ends_at') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then return false; end if;
  finish_at:=(c->>'ends_at')::timestamptz; if not isfinite(finish_at) or finish_at<start_at then return false; end if;
 end if;
 if jsonb_typeof(c->'interval')<>'number' or (c->>'interval')::numeric<>trunc((c->>'interval')::numeric) or (c->>'interval')::integer not between 1 and 365 or (freq='once' and (c->>'interval')::int<>1) then return false; end if;
 if jsonb_typeof(c->'weekdays')<>'array' or jsonb_typeof(c->'month_days')<>'array' then return false; end if;
 if (freq='weekly' and jsonb_array_length(c->'weekdays') not between 1 and 7) or (freq<>'weekly' and jsonb_array_length(c->'weekdays')<>0) or (freq='monthly' and jsonb_array_length(c->'month_days') not between 1 and 31) or (freq<>'monthly' and jsonb_array_length(c->'month_days')<>0) then return false; end if;
 seen:='{}'; for n in select value from jsonb_array_elements(c->'weekdays') loop if jsonb_typeof(n)<>'number' or (n::text)::numeric<>trunc((n::text)::numeric) or (n::text)::int not between 0 and 6 or (n::text)::int=any(seen) then return false; end if; seen:=array_append(seen,(n::text)::int); end loop;
 seen:='{}'; for n in select value from jsonb_array_elements(c->'month_days') loop if jsonb_typeof(n)<>'number' or (n::text)::numeric<>trunc((n::text)::numeric) or (n::text)::int not between 1 and 31 or (n::text)::int=any(seen) then return false; end if; seen:=array_append(seen,(n::text)::int); end loop;
 return true;
exception when others then return false;
end $$;
create function public.schedule_next(c jsonb,after_at timestamptz) returns timestamptz language plpgsql immutable security invoker set search_path='' as $$
declare anchor_at timestamptz; local_anchor timestamp; local_cut timestamp; day_anchor date; week_anchor date; time_anchor time; candidate timestamptz; local_candidate date; freq text; cadence_interval integer; cycle integer; first_cycle integer; selected_day integer; month_index integer; y integer; m integer; result_at timestamptz;
begin
 if not public.schedule_cadence_valid(c) or not isfinite(after_at) then raise exception 'Invalid schedule cadence' using errcode='22023'; end if;
 anchor_at:=(c->>'starts_at')::timestamptz; freq:=c->>'frequency';cadence_interval:=(c->>'interval')::int;
 local_anchor:=anchor_at at time zone 'Asia/Manila';local_cut:=greatest(after_at,anchor_at-interval '1 millisecond') at time zone 'Asia/Manila';day_anchor:=local_anchor::date;time_anchor:=local_anchor::time;
 if freq='once' then result_at:=anchor_at;
 elsif freq='daily' then
  cycle:=greatest(0,floor(extract(epoch from (greatest(after_at,anchor_at-interval '1 millisecond')-anchor_at))/(86400*cadence_interval))+1)::int;
  result_at:=anchor_at+make_interval(days=>cycle*cadence_interval);
 elsif freq='weekly' then
  week_anchor:=day_anchor-extract(dow from day_anchor)::int;first_cycle:=greatest(0,floor((local_cut::date-week_anchor)::numeric/(7*cadence_interval)))::int;
  for cycle in first_cycle..first_cycle+1 loop
   for selected_day in select value::text::int from jsonb_array_elements(c->'weekdays') order by value::text::int loop
    candidate:=((week_anchor+cycle*7*cadence_interval+selected_day)+time_anchor) at time zone 'Asia/Manila';
    if candidate>=anchor_at and candidate>after_at then result_at:=candidate;exit;end if;
   end loop;
   exit when result_at is not null;
  end loop;
 else
  month_index:=extract(year from local_anchor)::int*12+extract(month from local_anchor)::int-1;
  first_cycle:=greatest(0,floor(((extract(year from local_cut)::int*12+extract(month from local_cut)::int-1)-month_index)::numeric/cadence_interval))::int;
  for cycle in first_cycle..first_cycle+12 loop
   y:=(month_index+cycle*cadence_interval)/12;m:=(month_index+cycle*cadence_interval)%12+1;
   for selected_day in select value::text::int from jsonb_array_elements(c->'month_days') order by value::text::int loop
    local_candidate:=make_date(y,m,1)+(selected_day-1);if extract(month from local_candidate)::int<>m then continue;end if;
    candidate:=(local_candidate+time_anchor) at time zone 'Asia/Manila';
    if candidate>=anchor_at and candidate>after_at then result_at:=candidate;exit;end if;
   end loop;
   exit when result_at is not null;
  end loop;
 end if;
 if result_at<=after_at or (c->>'ends_at' is not null and result_at>(c->>'ends_at')::timestamptz) then return null;end if;
 return result_at;
end $$;
revoke all on function public.schedule_cadence_valid(jsonb),public.schedule_next(jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.schedule_cadence_valid(jsonb),public.schedule_next(jsonb,timestamptz) to authenticated;
create table public.campaign_schedules(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 campaign_id uuid not null unique references public.campaign_jobs(id) on delete cascade,
 cadence jsonb not null check(public.schedule_cadence_valid(cadence)),
 state text not null default 'paused' check(state in ('paused','enabled','blocked','completed')),
 revision integer not null default 1 check(revision>0),approved_digest text,next_run_at timestamptz,current_run_id uuid,stop_reason text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index campaign_schedules_owner_created on public.campaign_schedules(user_id,created_at desc);
create index campaign_schedules_current_run_idx on public.campaign_schedules(current_run_id) where current_run_id is not null;
create index campaign_schedules_owner_due on public.campaign_schedules(user_id,next_run_at) where state='enabled';
create table public.campaign_schedule_runs(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 schedule_id uuid references public.campaign_schedules(id) on delete set null,campaign_id uuid references public.campaign_jobs(id) on delete set null,
 scheduled_at timestamptz not null,started_at timestamptz,finished_at timestamptz,
 state text not null check(state in ('running','completed','blocked','cancelled','missed')),outcomes jsonb not null default '[]'::jsonb,
 unique(schedule_id,scheduled_at)
);
create index campaign_schedule_runs_owner on public.campaign_schedule_runs(user_id,scheduled_at desc);
create index campaign_schedule_runs_campaign on public.campaign_schedule_runs(campaign_id);
alter table public.campaign_schedules add constraint schedule_current_run foreign key(current_run_id) references public.campaign_schedule_runs(id) on delete set null;
alter table public.campaign_schedules enable row level security;alter table public.campaign_schedules force row level security;
alter table public.campaign_schedule_runs enable row level security;alter table public.campaign_schedule_runs force row level security;
revoke all on public.campaign_schedules,public.campaign_schedule_runs from public,anon,authenticated;
grant select on public.campaign_schedules,public.campaign_schedule_runs to authenticated;
create policy schedules_owner_read on public.campaign_schedules for select to authenticated using(user_id=(select auth.uid()));
create policy schedule_runs_owner_read on public.campaign_schedule_runs for select to authenticated using(user_id=(select auth.uid()));
-- Keep the prior command implementation inaccessible to clients. Only this checked wrapper can delegate.
create schema staysuite_schedule_private;
revoke all on schema staysuite_schedule_private from public,anon,authenticated;
alter function public.campaign_command(uuid,integer,text,jsonb) set schema staysuite_schedule_private;
revoke all on function staysuite_schedule_private.campaign_command(uuid,integer,text,jsonb) from public,anon,authenticated;
create function public.campaign_command(p_id uuid,p_revision integer,p_command text,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Sign in required' using errcode='42501';end if;
 if p_command in ('start','resume','claim','validate_one') and exists(select 1 from public.campaign_schedules s where s.campaign_id=p_id and s.user_id=auth.uid() and s.state='enabled' and s.current_run_id is null) then raise exception 'This campaign waits for its scheduled run' using errcode='55000';end if;
 return staysuite_schedule_private.campaign_command(p_id,p_revision,p_command,p_payload);
end $$;
revoke all on function public.campaign_command(uuid,integer,text,jsonb) from public,anon,authenticated;grant execute on function public.campaign_command(uuid,integer,text,jsonb) to authenticated;
create function public.schedule_command(p_id uuid,p_revision integer,p_operation text,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();s public.campaign_schedules;c public.campaign_jobs;r public.campaign_schedule_runs;next_at timestamptz;result jsonb;run_id uuid;ids jsonb:='[]';fail text;cadence jsonb;v_digest text;
begin
 if u is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Sign in required' using errcode='42501';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>8000 then raise exception 'Invalid schedule payload' using errcode='22023';end if;
 -- Serializes schedule tick/configuration and eliminates duplicate dispatch across tabs.
 perform pg_advisory_xact_lock(hashtextextended('schedule-owner:'||u::text,0));
 if p_operation='tick' then
  if p_payload-array['actor_id','actor_type']::text[]<>'{}'::jsonb or coalesce(p_payload->>'actor_id','') !~ '^[1-9][0-9]{0,79}$' or coalesce(p_payload->>'actor_type','') not in ('personal','page') then raise exception 'Choose a current Facebook identity' using errcode='22023';end if;
  for s in select * from public.campaign_schedules where user_id=u and (state='enabled' or current_run_id is not null) order by next_run_at nulls last,id for update loop
   select * into c from public.campaign_jobs where id=s.campaign_id and user_id=u for update;
   if c.actor_id is distinct from p_payload->>'actor_id' or c.actor_type is distinct from p_payload->>'actor_type' then continue;end if;
   v_digest:=staysuite_campaign_private.snapshot(c.id);
   if s.current_run_id is not null then
    if c.state='running' then if s.state='enabled' then ids:=ids||to_jsonb(c.id);end if;continue;end if;
    if c.state='paused' then if s.state='enabled' then update public.campaign_schedules set state='paused',stop_reason='Campaign paused; resume explicitly',revision=revision+1,updated_at=now() where id=s.id;end if;continue;end if;
    update public.campaign_schedule_runs set state=case when c.state='completed' then 'completed' when c.state='cancelled' then 'cancelled' else 'blocked' end,finished_at=now(),outcomes=coalesce((select jsonb_agg(to_jsonb(t) order by position) from public.campaign_targets t where t.campaign_id=c.id),'[]') where id=s.current_run_id;
    if c.state<>'completed' then update public.campaign_schedules set state='blocked',stop_reason='Submission needs review; no automatic retry',current_run_id=null,revision=revision+1,updated_at=now() where id=s.id;continue;end if;
    next_at:=public.schedule_next(s.cadence,greatest(s.next_run_at,now()));
    update public.campaign_schedules set current_run_id=null,next_run_at=next_at,state=case when next_at is null then 'completed' when s.state='enabled' then 'enabled' else 'paused' end,revision=revision+1,updated_at=now() where id=s.id;continue;
   end if;
   if s.state<>'enabled' then continue;end if;
   if c.state in ('paused','blocked','cancelled') or s.approved_digest is distinct from v_digest or c.approved_digest is distinct from v_digest or not staysuite_campaign_private.rules_ready(c.id) then update public.campaign_schedules set state='blocked',stop_reason='Campaign approval, rules or state changed',revision=revision+1,updated_at=now() where id=s.id;continue;end if;
   if s.next_run_at is null or s.next_run_at>now() then continue;end if;
   if s.next_run_at<now()-interval '15 minutes' then
    insert into public.campaign_schedule_runs(user_id,schedule_id,campaign_id,scheduled_at,finished_at,state) values(u,s.id,c.id,s.next_run_at,now(),'missed') on conflict do nothing;
    next_at:=public.schedule_next(s.cadence,now());update public.campaign_schedules set next_run_at=next_at,state=case when next_at is null then 'completed' else 'enabled' end,stop_reason='Missed run skipped; no catch-up burst',revision=revision+1,updated_at=now() where id=s.id;continue;
   end if;
   if c.state not in ('ready','completed') or exists(select 1 from public.campaign_targets where campaign_id=c.id and state in ('claimed','uncertain','stopped','refused')) then update public.campaign_schedules set state='blocked',stop_reason='Review earlier submissions before another run',revision=revision+1,updated_at=now() where id=s.id;continue;end if;
   if exists(select 1 from public.campaign_jobs other where other.user_id=u and other.actor_id=c.actor_id and other.actor_type=c.actor_type and other.state='running' and other.id<>c.id) then continue;end if;
   begin
    insert into public.campaign_schedule_runs(user_id,schedule_id,campaign_id,scheduled_at,started_at,state) values(u,s.id,c.id,s.next_run_at,now(),'running') returning id into run_id;
    update public.campaign_schedules set current_run_id=run_id,revision=revision+1,updated_at=now() where id=s.id;
    if c.state='completed' then
     if not exists(select 1 from public.campaign_schedule_runs where campaign_id=c.id and state='completed') then
      insert into public.campaign_schedule_runs(user_id,campaign_id,scheduled_at,finished_at,state,outcomes) select u,c.id,coalesce(min(outcome_at),c.updated_at),coalesce(max(outcome_at),c.updated_at),'completed',coalesce(jsonb_agg(to_jsonb(t) order by position),'[]') from public.campaign_targets t where t.campaign_id=c.id;
     end if;
     update public.campaign_targets set state='queued',attempt_token=null,claimed_at=null,lease_until=null,post_url=null,receipt_source=null,outcome_at=null where campaign_id=c.id;
     update public.campaign_jobs set state='ready',stop_reason=null,revision=revision+1,updated_at=now() where id=c.id returning * into c;
    end if;
    result:=public.campaign_command(c.id,c.revision,'start',p_payload);
    if result->>'state'<>'running' then raise exception 'Approval no longer ready' using errcode='55000';end if;
    ids:=ids||to_jsonb(c.id);
   exception when others then
    get stacked diagnostics fail=returned_sqlstate;
    update public.campaign_schedules set state='blocked',stop_reason=case when fail='42501' then 'Facebook identity or account changed' else 'Publishing validation or approval requires review' end,revision=revision+1,updated_at=now() where id=s.id;
   end;
  end loop;
  return jsonb_build_object('campaign_ids',ids);
 end if;
 if p_operation='create' then
  if (select count(*) from public.campaign_schedules where user_id=u)>=200 then raise exception 'Schedule capacity reached' using errcode='22023';end if;
  if p_payload-array['campaign_id','cadence']::text[]<>'{}'::jsonb then raise exception 'Invalid schedule payload' using errcode='22023';end if;
  select * into c from public.campaign_jobs where id=(p_payload->>'campaign_id')::uuid and user_id=u for update;
  if not found then raise exception 'Campaign not found' using errcode='42501';end if;
  if c.revision is distinct from p_revision then raise exception 'Campaign changed; reload' using errcode='PT409';end if;
  cadence:=p_payload->'cadence';if not public.schedule_cadence_valid(cadence) then raise exception 'Check the schedule and selected days' using errcode='22023';end if;
  next_at:=public.schedule_next(cadence,now());if next_at is null then raise exception 'Choose a schedule with a future occurrence' using errcode='22023';end if;
  insert into public.campaign_schedules(id,user_id,campaign_id,cadence,next_run_at) values(p_id,u,c.id,cadence,next_at) returning * into s;
 else
  select * into s from public.campaign_schedules where id=p_id and user_id=u for update;
  if not found then raise exception 'Schedule not found' using errcode='42501';end if;
  if s.revision is distinct from p_revision then raise exception 'Schedule changed; reload' using errcode='PT409';end if;
  select * into c from public.campaign_jobs where id=s.campaign_id and user_id=u for update;
  if s.current_run_id is not null and c.state in ('completed','cancelled','blocked') then
   update public.campaign_schedule_runs set state=case when c.state='completed' then 'completed' when c.state='cancelled' then 'cancelled' else 'blocked' end,finished_at=now(),outcomes=coalesce((select jsonb_agg(to_jsonb(t) order by position) from public.campaign_targets t where t.campaign_id=c.id),'[]') where id=s.current_run_id;
   update public.campaign_schedules set current_run_id=null where id=s.id;s.current_run_id:=null;
  end if;
  if p_operation='update' then
   if s.current_run_id is not null then raise exception 'Finish the current run before editing' using errcode='55000';end if;
   if p_payload-array['cadence']::text[]<>'{}'::jsonb or not public.schedule_cadence_valid(p_payload->'cadence') then raise exception 'Check the schedule and selected days' using errcode='22023';end if;
   next_at:=public.schedule_next(p_payload->'cadence',now());if next_at is null then raise exception 'Choose a future occurrence' using errcode='22023';end if;
   update public.campaign_schedules set cadence=p_payload->'cadence',next_run_at=next_at,state='paused',approved_digest=null,stop_reason='Schedule changed; review before enabling',revision=revision+1,updated_at=now() where id=s.id returning * into s;
  elsif p_operation='enable' then
   if c.settings->>'method'<>'direct' then raise exception 'Scheduled execution requires the validated Direct adapter' using errcode='55000';end if;
   if p_payload<>jsonb_build_object('reviewed',true) then raise exception 'Review this exact schedule before enabling' using errcode='22023';end if;
   if s.current_run_id is not null then
    if c.state='paused' and s.approved_digest=staysuite_campaign_private.snapshot(c.id) and c.approved_digest=s.approved_digest and staysuite_campaign_private.rules_ready(c.id) then
     perform public.campaign_command(c.id,c.revision,'resume',jsonb_build_object('actor_id',c.actor_id,'actor_type',c.actor_type));
     update public.campaign_schedules set state='enabled',stop_reason=null,revision=revision+1,updated_at=now() where id=s.id returning * into s;
     return to_jsonb(s);
    end if;
    raise exception 'Resolve the current run before enabling' using errcode='55000';
   end if;
   if c.state not in ('ready','completed') or c.actor_id is null or c.approved_digest is distinct from staysuite_campaign_private.snapshot(c.id) or not staysuite_campaign_private.rules_ready(c.id) or exists(select 1 from public.campaign_targets where campaign_id=c.id and state in ('claimed','uncertain','stopped','refused')) then raise exception 'Approve the exact campaign and review its groups in the extension first' using errcode='55000';end if;
   next_at:=public.schedule_next(s.cadence,now());if next_at is null then raise exception 'No future occurrence remains' using errcode='22023';end if;
   update public.campaign_schedules set state='enabled',next_run_at=next_at,approved_digest=c.approved_digest,stop_reason=null,revision=revision+1,updated_at=now() where id=s.id returning * into s;
  elsif p_operation='pause' then
   if p_payload<>'{}'::jsonb then raise exception 'Invalid pause payload' using errcode='22023';end if;
   if c.state='running' then perform public.campaign_command(c.id,c.revision,'pause','{}');end if;
   update public.campaign_schedules set state='paused',stop_reason='Paused by you',revision=revision+1,updated_at=now() where id=s.id returning * into s;
  elsif p_operation='delete' then
   if p_payload<>'{}'::jsonb or s.current_run_id is not null then raise exception 'Resolve the current run before removing its schedule' using errcode='55000';end if;
   delete from public.campaign_schedules where id=s.id;return jsonb_build_object('deleted_id',s.id);
  else raise exception 'Unknown schedule operation' using errcode='22023';end if;
 end if;
 return to_jsonb(s);
end $$;
revoke all on function public.schedule_command(uuid,integer,text,jsonb) from public,anon,authenticated;grant execute on function public.schedule_command(uuid,integer,text,jsonb) to authenticated;
notify pgrst,'reload schema';

-- Expose the schedule API through an invoker wrapper; privileged writes stay in a non-exposed schema.
alter function public.schedule_command(uuid,integer,text,jsonb) set schema staysuite_schedule_private;
revoke all on function staysuite_schedule_private.schedule_command(uuid,integer,text,jsonb) from public,anon,authenticated;
grant usage on schema staysuite_schedule_private to authenticated;
grant execute on function staysuite_schedule_private.schedule_command(uuid,integer,text,jsonb) to authenticated;
create function public.schedule_command(p_id uuid,p_revision integer,p_operation text,p_payload jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$select staysuite_schedule_private.schedule_command(p_id,p_revision,p_operation,p_payload)$$;
revoke all on function public.schedule_command(uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.schedule_command(uuid,integer,text,jsonb) to authenticated;
-- Do not let campaign cleanup erase unarchived run receipts.
alter function public.campaign_delete(uuid,integer,boolean) set schema staysuite_schedule_private;
revoke all on function staysuite_schedule_private.campaign_delete(uuid,integer,boolean) from public,anon,authenticated;
create function public.campaign_delete(p_id uuid,p_revision integer,p_finish boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Sign in required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('schedule-owner:'||auth.uid()::text,0));
 if exists(select 1 from public.campaign_schedules where campaign_id=p_id and user_id=auth.uid() and current_run_id is not null) then raise exception 'Resolve and archive the scheduled run before deleting its campaign' using errcode='55000';end if;
 return staysuite_schedule_private.campaign_delete(p_id,p_revision,p_finish);
end $$;
revoke all on function public.campaign_delete(uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.campaign_delete(uuid,integer,boolean) to authenticated;
notify pgrst,'reload schema';
