-- A single, specifically approved live validation never starts a bulk run.
alter table public.campaign_targets add column provider_code text check(provider_code is null or provider_code ~ '^[a-z_]{1,64}$');
create table staysuite_campaign_private.validation_trials (
 campaign_id uuid primary key references public.campaign_jobs(id) on delete cascade,
 target_id uuid not null references public.campaign_targets(id) on delete cascade,
 user_id uuid not null references auth.users(id),
 actor_id text not null,
 adapter_version text not null check(adapter_version='0.3.2'),
 confirmed_at timestamptz
);
create table staysuite_campaign_private.actor_validations (
 user_id uuid not null references auth.users(id),actor_id text not null,
 adapter_version text not null check(adapter_version='0.3.2'),
 target_id uuid not null references public.campaign_targets(id) on delete cascade,
 verified_at timestamptz not null,primary key(user_id,actor_id,adapter_version)
);
create index validation_trials_target on staysuite_campaign_private.validation_trials(target_id);
create index validation_trials_owner on staysuite_campaign_private.validation_trials(user_id,actor_id);
create index actor_validations_target on staysuite_campaign_private.actor_validations(target_id);
alter table staysuite_campaign_private.validation_trials enable row level security;
alter table staysuite_campaign_private.actor_validations enable row level security;
revoke all on staysuite_campaign_private.validation_trials,staysuite_campaign_private.actor_validations from public,anon,authenticated;

create function staysuite_campaign_private.publisher_ready(p_actor_id text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and coalesce(auth.jwt()->>'is_anonymous','false')<>'true' and (
 exists(select 1 from public.campaign_publishers where method='classic' and enabled and verified_at is not null)
 or exists(select 1 from staysuite_campaign_private.actor_validations v join public.campaign_targets t on t.id=v.target_id
 where v.user_id=auth.uid() and v.actor_id=p_actor_id and v.adapter_version='0.3.2' and v.verified_at>now()-interval '7 days'
 and t.state in('live','pending_admin') and t.post_url is not null));
$$;
revoke all on function staysuite_campaign_private.publisher_ready(text) from public,anon;
grant usage on schema staysuite_campaign_private to authenticated;
grant execute on function staysuite_campaign_private.publisher_ready(text) to authenticated;
create function public.campaign_publisher_ready(p_actor_id text) returns boolean
language sql stable security invoker set search_path='' as $$ select staysuite_campaign_private.publisher_ready(p_actor_id) $$;
revoke all on function public.campaign_publisher_ready(text) from public,anon;
grant execute on function public.campaign_publisher_ready(text) to authenticated;

create function staysuite_campaign_private.validation_command(p_id uuid,p_revision integer,p_command text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); c public.campaign_jobs; t public.campaign_targets; wake timestamptz; digest_now text;
begin
 if u is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Sign in required' using errcode='42501'; end if;
 select * into c from public.campaign_jobs where id=p_id and user_id=u for update;
 if not found then raise exception 'Campaign not found' using errcode='42501'; end if;
 if c.revision is distinct from p_revision then raise exception 'Campaign changed; review again' using errcode='PT409'; end if;
 if p_payload->>'reviewed' is distinct from 'true' or p_payload->>'adapter_version' is distinct from '0.3.2' or p_payload->>'actor_id' is distinct from c.actor_id or c.actor_type<>'personal' or c.actor_id is null or c.settings->>'method'<>'classic' then raise exception 'Review the exact campaign and personal Facebook profile' using errcode='22023'; end if;
 digest_now:=staysuite_campaign_private.snapshot(c.id);
 if p_payload->>'digest' is distinct from digest_now or c.approved_digest is distinct from digest_now or not staysuite_campaign_private.rules_ready(c.id) then raise exception 'Campaign or group permission changed; review again' using errcode='PT409'; end if;
 if p_command='validate_one' then
  perform pg_advisory_xact_lock(hashtextextended(u::text||':'||c.actor_type||':'||c.actor_id,0));
  if c.state<>'ready' or exists(select 1 from public.campaign_targets where campaign_id=c.id and state<>'queued') or exists(select 1 from staysuite_campaign_private.validation_trials where campaign_id=c.id) then raise exception 'Use a fresh approved campaign for one validation attempt' using errcode='22023'; end if;
  if exists(select 1 from public.campaign_targets x join public.campaign_jobs j on j.id=x.campaign_id where j.user_id=u and j.actor_id=c.actor_id and j.actor_type=c.actor_type and x.state in('claimed','uncertain','stopped')) then raise exception 'Review earlier submission first' using errcode='55000'; end if;
  if (select coalesce(sum((value->>'size')::bigint),0) from jsonb_array_elements(c.plan->'media'))>20971520 then raise exception 'Classic validation supports at most 20 MB' using errcode='22023'; end if;
  select * into t from public.campaign_targets where campaign_id=c.id order by position limit 1 for update;
  if t.id is null or p_payload->>'target_id' is distinct from t.id::text then raise exception 'Review the exact first target group' using errcode='22023'; end if;
  select greatest(c.next_eligible_at,coalesce(max(next_eligible_at),now())) into wake from public.campaign_jobs where user_id=u and actor_id=c.actor_id and actor_type=c.actor_type;
  if (c.settings->>'avoidNight')::bool then wake:=greatest(wake,staysuite_campaign_private.quiet_until(now())); end if;
  if wake>now() then
   update public.campaign_jobs set next_eligible_at=wake,stop_reason='Wait for the displayed eligibility time before a validation post',revision=revision+1,updated_at=now() where id=c.id;
  else
   insert into staysuite_campaign_private.validation_trials(campaign_id,target_id,user_id,actor_id,adapter_version)values(c.id,t.id,u,c.actor_id,'0.3.2');
   update public.campaign_targets set state='claimed',attempt_token=gen_random_uuid(),claimed_at=now(),lease_until=now()+interval '3 minutes' where id=t.id;
   update public.campaign_jobs set state='running',next_eligible_at=now()+make_interval(mins=>(c.plan->>'intervalMinutes')::int),stop_reason='Single owner-approved validation only; other groups wait',revision=revision+1,updated_at=now() where id=c.id;
  end if;
 elsif p_command='confirm_validation' then
  select x.* into t from public.campaign_targets x join staysuite_campaign_private.validation_trials v on v.target_id=x.id where v.campaign_id=c.id and v.user_id=u and v.actor_id=c.actor_id and v.adapter_version='0.3.2' and v.confirmed_at is null for update of x;
  if t.id is null or t.state not in('live','pending_admin') or t.post_url is null or p_payload->>'post_url' is distinct from t.post_url then raise exception 'Check the submitted post and matching receipt in Facebook first' using errcode='22023'; end if;
  update staysuite_campaign_private.validation_trials set confirmed_at=now() where campaign_id=c.id;
  insert into staysuite_campaign_private.actor_validations(user_id,actor_id,adapter_version,target_id,verified_at) values(u,c.actor_id,'0.3.2',t.id,now()) on conflict(user_id,actor_id,adapter_version) do update set target_id=excluded.target_id,verified_at=excluded.verified_at;
  update public.campaign_jobs set stop_reason='Validation recorded by owner; review and explicitly start remaining groups',revision=revision+1,updated_at=now() where id=c.id;
 else raise exception 'Unsupported validation command' using errcode='22023'; end if;
 return staysuite_campaign_private.campaign_command(c.id,0,'inspect','{}');
end $$;
revoke all on function staysuite_campaign_private.validation_command(uuid,integer,text,jsonb) from public,anon,authenticated;

create or replace function staysuite_campaign_private.campaign_command(p_id uuid,p_revision integer,p_command text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); c public.campaign_jobs; t public.campaign_targets; m public.campaign_media;
 v_plan jsonb; v_settings jsonb; item jsonb; n integer; total_bytes bigint; digest_now text;
 wait_minutes integer; target_url text; wake_at timestamptz;
begin
 if u is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>64000 then raise exception 'Invalid payload' using errcode='22023'; end if;
 if p_command='create' then
   perform pg_advisory_xact_lock(hashtextextended('campaign-capacity:'||u::text,0));
   if p_revision is distinct from 0 or (select count(*) from public.campaign_jobs where user_id=u and state not in ('cancelled','completed'))>=20 then raise exception 'Campaign capacity or revision invalid' using errcode='22023'; end if;
   insert into public.campaign_jobs(id,user_id,actor_id,actor_type,plan,settings)
     values(p_id,u,p_payload->>'actor_id',coalesce(p_payload->>'actor_type','personal'),'{}','{}') returning * into c;
 else
   select * into c from public.campaign_jobs where id=p_id and user_id=u for update;
   if not found then raise exception 'Campaign not found' using errcode='42501'; end if;
   if p_command not in ('report','recover','inspect') and c.revision is distinct from p_revision then raise exception 'Campaign changed; reload' using errcode='PT409'; end if;
 end if;
 if p_command='inspect' then
   return to_jsonb(c)||jsonb_build_object('digest',staysuite_campaign_private.snapshot(c.id),'targets',coalesce((select jsonb_agg(to_jsonb(x) order by position) from public.campaign_targets x where campaign_id=c.id),'[]'::jsonb),'media',coalesce((select jsonb_agg(to_jsonb(x) order by position) from public.campaign_media x where campaign_id=c.id),'[]'::jsonb));
 elsif p_command in ('create','edit') then
   if c.state not in ('draft','ready','paused','blocked') or exists(select 1 from public.campaign_targets where campaign_id=c.id and state<>'queued') then raise exception 'Dispatched campaigns cannot be edited' using errcode='22023'; end if;
   v_plan:=p_payload->'plan'; v_settings:=coalesce(p_payload->'settings','{}');
   if v_plan is null or jsonb_typeof(v_plan)<>'object' or v_plan-array['version','text','intervalMinutes','groupIds','media']<>'{}'::jsonb
     or v_plan->'version' is distinct from '1'::jsonb or jsonb_typeof(v_plan->'text') is distinct from 'string' or length(btrim(v_plan->>'text')) not between 1 and 10000
     or jsonb_typeof(v_plan->'intervalMinutes') is distinct from 'number' or coalesce(v_plan->>'intervalMinutes','') !~ '^[0-9]{1,4}$' or (v_plan->>'intervalMinutes')::int not between 1 and 1440
     or jsonb_typeof(v_plan->'groupIds') is distinct from 'array' or jsonb_array_length(v_plan->'groupIds') not between 1 and 50
     or jsonb_typeof(v_plan->'media') is distinct from 'array' or jsonb_array_length(v_plan->'media')>10 then raise exception 'Invalid campaign plan' using errcode='22023'; end if;
   if jsonb_typeof(v_settings)<>'object' or v_settings-array['method','pauseEvery','pauseMinutes','avoidNight','delayAfterFailure']<>'{}'::jsonb
     or coalesce(v_settings->>'method','classic') not in ('classic','direct')
     or (v_settings ? 'pauseEvery' and jsonb_typeof(v_settings->'pauseEvery')<>'number')
     or (v_settings ? 'pauseMinutes' and jsonb_typeof(v_settings->'pauseMinutes')<>'number')
     or coalesce(v_settings->>'pauseEvery','1') !~ '^[0-9]{1,2}$' or coalesce((v_settings->>'pauseEvery')::int,1) not between 1 and 50
     or coalesce(v_settings->>'pauseMinutes','2') !~ '^[0-9]{1,4}$' or coalesce((v_settings->>'pauseMinutes')::int,2) not between 1 and 1440
     or coalesce(jsonb_typeof(v_settings->'avoidNight'),'boolean')<>'boolean' or coalesce(jsonb_typeof(v_settings->'delayAfterFailure'),'boolean')<>'boolean' then raise exception 'Invalid timing settings' using errcode='22023'; end if;
   v_settings:=jsonb_build_object('method',coalesce(v_settings->>'method','classic'),'pauseEvery',coalesce((v_settings->>'pauseEvery')::int,1),'pauseMinutes',coalesce((v_settings->>'pauseMinutes')::int,2),'avoidNight',coalesce((v_settings->>'avoidNight')::bool,true),'delayAfterFailure',coalesce((v_settings->>'delayAfterFailure')::bool,true));
   select count(distinct value) into n from jsonb_array_elements_text(v_plan->'groupIds');
   if n<>jsonb_array_length(v_plan->'groupIds') or n<>(select count(*) from public.saved_groups g where g.user_id=u and g.id::text in(select value from jsonb_array_elements_text(v_plan->'groupIds'))) then raise exception 'Select owned groups once' using errcode='42501'; end if;
   total_bytes:=0;
   for item in select value from jsonb_array_elements(v_plan->'media') loop
     if jsonb_typeof(item)<>'object' or item-array['name','type','size','sha256']<>'{}'::jsonb or jsonb_typeof(item->'name') is distinct from 'string' or jsonb_typeof(item->'type') is distinct from 'string' or jsonb_typeof(item->'size') is distinct from 'number' or jsonb_typeof(item->'sha256') is distinct from 'string' or coalesce(length(item->>'name'),0) not between 1 and 255
       or coalesce(item->>'type','') not in ('image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime')
       or coalesce(item->>'size','') !~ '^[0-9]{1,8}$' or (item->>'size')::bigint not between 1 and 52428800 or coalesce(item->>'sha256','') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid media manifest' using errcode='22023'; end if;
     if item->>'type' like 'video/%' and jsonb_array_length(v_plan->'media')<>1 then raise exception 'Choose photos or one video' using errcode='22023'; end if;
     total_bytes:=total_bytes+(item->>'size')::bigint;
   end loop;
   if total_bytes>52428800 or (select count(distinct value->>'sha256') from jsonb_array_elements(v_plan->'media'))<>jsonb_array_length(v_plan->'media') then raise exception 'Media limit or duplicate attachment' using errcode='22023'; end if;
   -- Existing media cannot silently be rebound to different bytes.
   if p_command='edit' and exists(select 1 from public.campaign_media where campaign_id=c.id) and v_plan->'media'<>c.plan->'media' then raise exception 'Create a new campaign to replace uploaded media' using errcode='22023'; end if;
   delete from public.campaign_targets where campaign_id=c.id;
   insert into public.campaign_targets(campaign_id,group_id,position) select c.id,value::uuid,(ordinality-1)::int from jsonb_array_elements_text(v_plan->'groupIds') with ordinality;
   update public.campaign_jobs set plan=v_plan,settings=v_settings,state='draft',approved_digest=null,stop_reason=null where id=c.id;
 elsif p_command='bind_actor' then
   if c.state not in ('draft','ready') then raise exception 'Return to a draft before switching accounts' using errcode='22023'; end if;
   if coalesce(p_payload->>'actor_id','') !~ '^[1-9][0-9]{0,79}$' or coalesce(p_payload->>'actor_type','') not in ('personal','page') then raise exception 'Invalid Facebook actor' using errcode='22023'; end if;
   update public.campaign_jobs set actor_id=p_payload->>'actor_id',actor_type=p_payload->>'actor_type',approved_digest=null,state='draft' where id=c.id;
 elsif p_command='reserve_media' then
   if c.state<>'draft' then raise exception 'Media needs a draft campaign' using errcode='22023'; end if;
   n:=(p_payload->>'position')::int;
   if n<0 or n>=jsonb_array_length(c.plan->'media') then raise exception 'Invalid media position' using errcode='22023'; end if;
   select * into m from public.campaign_media where campaign_id=c.id and position=n;
   if not found then
     m.id:=gen_random_uuid();
     insert into public.campaign_media(id,campaign_id,position,object_path,manifest) values(m.id,c.id,n,u::text||'/'||c.id::text||'/'||m.id::text,c.plan->'media'->n);
   end if;
 elsif p_command='media_uploaded' then
   if c.state<>'draft' then raise exception 'Media needs a draft campaign' using errcode='22023'; end if;
   update public.campaign_media x set uploaded=true where x.campaign_id=c.id and x.id=(p_payload->>'asset_id')::uuid and exists(select 1 from storage.objects o where o.bucket_id='campaign-media' and o.name=x.object_path and (o.metadata->>'size')::bigint=(x.manifest->>'size')::bigint);
   if not found then raise exception 'Upload is missing or has wrong size' using errcode='22023'; end if;
 elsif p_command='approve' then
   if c.actor_id is null or c.state not in ('draft','ready') or not staysuite_campaign_private.rules_ready(c.id) then raise exception 'Review current group rules and permission' using errcode='22023'; end if;
   if (select count(*) from public.campaign_media where campaign_id=c.id and uploaded)<>jsonb_array_length(c.plan->'media') then raise exception 'Finish all media uploads' using errcode='22023'; end if;
   digest_now:=staysuite_campaign_private.snapshot(c.id);
   if p_payload->>'digest' is distinct from digest_now then raise exception 'Review the current campaign version' using errcode='PT409'; end if;
   update public.campaign_jobs set state='ready',approved_digest=digest_now,stop_reason=null where id=c.id;
 elsif p_command in ('start','resume','claim') then
   perform pg_advisory_xact_lock(hashtextextended(u::text||':'||c.actor_type||':'||c.actor_id,0));
   if c.state not in ('ready','running','paused') then raise exception 'Campaign cannot start' using errcode='22023'; end if;
   if not (exists(select 1 from public.campaign_publishers where method=c.settings->>'method' and enabled and verified_at is not null) or (c.settings->>'method'='classic' and staysuite_campaign_private.publisher_ready(c.actor_id))) then raise exception 'Publishing adapter is not validated; nothing sent' using errcode='55000'; end if;
   if p_payload->>'actor_id' is distinct from c.actor_id or p_payload->>'actor_type' is distinct from c.actor_type then raise exception 'Facebook actor changed' using errcode='42501'; end if;
   if c.approved_digest is distinct from staysuite_campaign_private.snapshot(c.id) or not staysuite_campaign_private.rules_ready(c.id) then
     update public.campaign_jobs set state='blocked',stop_reason='Approval or rules changed' where id=c.id;
   elsif p_command='claim' then
     if c.state<>'running' then raise exception 'Start or resume the campaign first' using errcode='22023'; end if;
     if exists(select 1 from public.campaign_targets x join public.campaign_jobs j on j.id=x.campaign_id where j.user_id=u and j.actor_id=c.actor_id and j.actor_type=c.actor_type and x.state in ('claimed','uncertain','stopped')) then raise exception 'An earlier submission needs a result or review' using errcode='55000'; end if;
     select greatest(c.next_eligible_at,max(j.next_eligible_at)) into wake_at from public.campaign_jobs j where j.user_id=u and j.actor_id=c.actor_id and j.actor_type=c.actor_type;
     c.next_eligible_at:=wake_at;
     update public.campaign_jobs set next_eligible_at=wake_at where id=c.id;
     wake_at:=staysuite_campaign_private.quiet_until(now());
     if (c.settings->>'avoidNight')::bool and wake_at>now() then
       update public.campaign_jobs set next_eligible_at=greatest(next_eligible_at,wake_at),stop_reason='Quiet hours until 07:00 Asia/Manila' where id=c.id;
     elsif c.next_eligible_at<=now() then
       select * into t from public.campaign_targets where campaign_id=c.id and state='queued' order by position limit 1 for update;
       if found then
         update public.campaign_targets set state='claimed',attempt_token=gen_random_uuid(),claimed_at=now(),lease_until=now()+interval '3 minutes' where id=t.id;
         -- Reserve the interval before dispatch so a lost report/restart cannot erase it.
         wait_minutes:=(c.plan->>'intervalMinutes')::int;
         update public.campaign_jobs set next_eligible_at=greatest(next_eligible_at,now()+make_interval(mins=>wait_minutes)) where id=c.id;
       else update public.campaign_jobs set state='completed' where id=c.id; end if;
     end if;
   else
     update public.campaign_jobs set state='running',stop_reason=null where id=c.id;
   end if;
 elsif p_command='report' then
   select * into t from public.campaign_targets where campaign_id=c.id and attempt_token=(p_payload->>'attempt_token')::uuid for update;
   if not found then raise exception 'Unknown submission token' using errcode='42501'; end if;
   if t.state<>'claimed' then return to_jsonb(c)||jsonb_build_object('digest',staysuite_campaign_private.snapshot(c.id),'duplicate_report',true,'targets',coalesce((select jsonb_agg(to_jsonb(x) order by position) from public.campaign_targets x where campaign_id=c.id),'[]'::jsonb),'media',coalesce((select jsonb_agg(to_jsonb(x) order by position) from public.campaign_media x where campaign_id=c.id),'[]'::jsonb)); end if;
   if coalesce(p_payload->>'outcome','') not in ('live','pending_admin','refused','uncertain','stopped') then raise exception 'Invalid publication outcome' using errcode='22023'; end if;
   if p_payload ? 'provider_code' and (jsonb_typeof(p_payload->'provider_code')<>'string' or coalesce(p_payload->>'provider_code','') !~ '^[a-z_]{1,64}$') then raise exception 'Invalid provider diagnostic' using errcode='22023'; end if;
   target_url:=p_payload->>'post_url';
   if p_payload->>'outcome' in ('live','pending_admin') and target_url is null then raise exception 'A matching post URL is required' using errcode='22023'; end if;
   if target_url is not null and (target_url !~ '^https://www\.facebook\.com/groups/[^/?#]+/posts/[0-9]+/?$' or split_part(target_url,'/',5)<>(select split_part(url,'/',5) from public.saved_groups where id=t.group_id)) then raise exception 'A matching group post URL is required' using errcode='22023'; end if;
   -- Outcomes remain client reports, not independently verified Facebook analytics.
   update public.campaign_targets set state=case when lease_until<now() then 'uncertain' else p_payload->>'outcome' end,post_url=target_url,receipt_source='extension_report',provider_code=p_payload->>'provider_code',outcome_at=now() where id=t.id returning * into t;
   wait_minutes:=(c.plan->>'intervalMinutes')::int;
   if (t.state in ('live','pending_admin') or (c.settings->>'delayAfterFailure')::bool) and (t.position+1)%(c.settings->>'pauseEvery')::int=0 then wait_minutes:=greatest(wait_minutes,(c.settings->>'pauseMinutes')::int); end if;
   update public.campaign_jobs set next_eligible_at=greatest(next_eligible_at,now()+make_interval(mins=>wait_minutes)),
     state=case when c.state='cancelled' then 'cancelled' when t.state in ('uncertain','refused','stopped') then 'blocked' when not exists(select 1 from public.campaign_targets where campaign_id=c.id and state='queued') then 'completed' else c.state end,
     stop_reason=case when t.state in ('uncertain','refused','stopped') then 'Submission needs review; no automatic retry' else stop_reason end where id=c.id;
 elsif p_command='recover' then
   update public.campaign_targets set state='uncertain',receipt_source='extension_report',outcome_at=now() where campaign_id=c.id and state='claimed' and lease_until<now();
   if found then update public.campaign_jobs set state=case when state='cancelled' then state else 'blocked' end,stop_reason='Interrupted submission: check Facebook before any retry' where id=c.id; end if;
 elsif p_command='resolve' then
   if p_payload->>'reviewed' is distinct from 'true' then raise exception 'Explicit review required' using errcode='22023'; end if;
   select * into t from public.campaign_targets where campaign_id=c.id and id=(p_payload->>'target_id')::uuid and state in ('uncertain','stopped') for update;
   if not found or coalesce(p_payload->>'outcome','') not in ('live','pending_admin','not_sent') then raise exception 'Review a held submission' using errcode='22023'; end if;
   target_url:=p_payload->>'post_url';
   if p_payload->>'outcome' in ('live','pending_admin') and target_url is null then raise exception 'A matching post URL is required' using errcode='22023'; end if;
   if target_url is not null and (target_url !~ '^https://www\.facebook\.com/groups/[^/?#]+/posts/[0-9]+/?$' or split_part(target_url,'/',5)<>(select split_part(url,'/',5) from public.saved_groups where id=t.group_id)) then raise exception 'Matching post URL required' using errcode='22023'; end if;
   update public.campaign_targets set state=p_payload->>'outcome',post_url=target_url,receipt_source='user_review',outcome_at=now() where id=t.id;
   if c.state<>'cancelled' then update public.campaign_jobs set state=case when exists(select 1 from public.campaign_targets where campaign_id=c.id and state='queued') then 'paused' else 'completed' end,stop_reason='Outcome recorded by owner; no submission was retried' where id=c.id; end if;
 elsif p_command='pause' then
   if c.state<>'running' then raise exception 'Campaign is not running' using errcode='22023'; end if;
   update public.campaign_jobs set state='paused',stop_reason='Paused by owner' where id=c.id;
 elsif p_command='cancel' then
   if c.state='completed' then raise exception 'Campaign already completed' using errcode='22023'; end if;
   update public.campaign_jobs set state='cancelled',stop_reason='Cancelled by owner; an in-flight submission may still finish' where id=c.id;
 else raise exception 'Unknown campaign command' using errcode='22023';
 end if;
 update public.campaign_jobs set revision=revision+1,updated_at=now() where id=c.id returning * into c;
 return to_jsonb(c)||jsonb_build_object('digest',staysuite_campaign_private.snapshot(c.id),
   'targets',coalesce((select jsonb_agg(to_jsonb(x) order by position) from public.campaign_targets x where campaign_id=c.id),'[]'::jsonb),
   'media',coalesce((select jsonb_agg(to_jsonb(x) order by position) from public.campaign_media x where campaign_id=c.id),'[]'::jsonb));
end $$;
create or replace function public.campaign_command(p_id uuid,p_revision integer,p_command text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_command in ('validate_one','confirm_validation') then return staysuite_campaign_private.validation_command(p_id,p_revision,p_command,p_payload); end if;
 if p_command in ('create','edit') then
   if (p_payload ? 'title' and (jsonb_typeof(p_payload->'title')<>'string' or length(p_payload->>'title')>120)) or (p_payload ? 'description' and (jsonb_typeof(p_payload->'description')<>'string' or length(p_payload->>'description')>2000)) then raise exception 'Check title and description' using errcode='22023'; end if;
   result:=staysuite_campaign_private.campaign_command(p_id,p_revision,p_command,p_payload-array['title','description']);
   update public.campaign_jobs set title=coalesce(p_payload->>'title',title),description=coalesce(p_payload->>'description',description) where id=p_id and user_id=auth.uid();
   return staysuite_campaign_private.campaign_command(p_id,0,'inspect','{}');
 end if;
 result:=staysuite_campaign_private.campaign_command(p_id,p_revision,p_command,p_payload);
 if p_command in ('report','recover') then
   if exists(select 1 from public.campaign_targets where campaign_id=p_id and state in('uncertain','stopped','refused')) then
     delete from staysuite_campaign_private.actor_validations where user_id=auth.uid() and actor_id=result->>'actor_id';
   end if;
   if exists(select 1 from staysuite_campaign_private.validation_trials where campaign_id=p_id and confirmed_at is null) and result->>'state'='running' and not exists(select 1 from public.campaign_targets where campaign_id=p_id and state='claimed') then
     update public.campaign_jobs set state='paused',stop_reason='One validation post finished. Check its Facebook receipt before enabling a bulk run',revision=revision+1,updated_at=now() where id=p_id;
     result:=staysuite_campaign_private.campaign_command(p_id,0,'inspect','{}');
   end if;
 end if;
 return result;
end $$;
notify pgrst,'reload schema';
