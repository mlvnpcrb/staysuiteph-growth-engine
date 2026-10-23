-- Additive campaign infrastructure. No existing table, Auth object or policy is changed.
create schema staysuite_campaign_private;
revoke all on schema staysuite_campaign_private from public, anon, authenticated;
create table public.campaign_publishers (
  method text primary key check(method in ('classic','direct')),
  enabled boolean not null default false,
  verified_at timestamptz,
  check(not enabled or verified_at is not null)
);
insert into public.campaign_publishers(method) values('classic'),('direct');
alter table public.campaign_publishers enable row level security;
create policy publisher_status on public.campaign_publishers for select to authenticated using(true);
grant select on public.campaign_publishers to authenticated;
revoke all on public.campaign_publishers from anon;
create table public.campaign_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  actor_id text check(actor_id ~ '^[1-9][0-9]{0,79}$'),
  actor_type text not null check(actor_type in ('personal','page')),
  plan jsonb not null check(jsonb_typeof(plan)='object' and octet_length(plan::text)<=64000),
  settings jsonb not null,
  state text not null default 'draft' check(state in ('draft','ready','running','paused','blocked','completed','cancelled')),
  revision integer not null default 1 check(revision>0),
  approved_digest text,
  next_eligible_at timestamptz not null default now(),
  stop_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index campaign_jobs_owner on public.campaign_jobs(user_id,updated_at desc);
create table public.campaign_targets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaign_jobs(id),
  group_id uuid not null references public.saved_groups(id),
  position integer not null check(position>=0 and position<50),
  state text not null default 'queued' check(state in ('queued','claimed','live','pending_admin','refused','uncertain','stopped','not_sent')),
  attempt_token uuid,
  claimed_at timestamptz,
  lease_until timestamptz,
  post_url text check(post_url is null or length(post_url)<=500),
  receipt_source text check(receipt_source is null or receipt_source in ('extension_report','user_review')),
  outcome_at timestamptz,
  unique(campaign_id,position), unique(campaign_id,group_id)
);
create unique index campaign_single_claim on public.campaign_targets(campaign_id) where state='claimed';
create table public.campaign_media (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaign_jobs(id),
  position integer not null check(position>=0 and position<10),
  object_path text not null unique,
  manifest jsonb not null,
  uploaded boolean not null default false,
  unique(campaign_id,position)
);
-- No client receives table write privileges. Mutations go through checked commands.
alter table public.campaign_jobs enable row level security;
alter table public.campaign_targets enable row level security;
alter table public.campaign_media enable row level security;
create policy campaign_owner_read on public.campaign_jobs for select to authenticated using(user_id=(select auth.uid()));
create policy campaign_target_owner_read on public.campaign_targets for select to authenticated using(exists(select 1 from public.campaign_jobs c where c.id=campaign_id and c.user_id=(select auth.uid())));
create policy campaign_media_owner_read on public.campaign_media for select to authenticated using(exists(select 1 from public.campaign_jobs c where c.id=campaign_id and c.user_id=(select auth.uid())));
revoke all on public.campaign_jobs,public.campaign_targets,public.campaign_media from anon,authenticated;
grant select on public.campaign_jobs,public.campaign_targets,public.campaign_media to authenticated;

create function staysuite_campaign_private.snapshot(p_id uuid) returns text
language sql stable security invoker set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_object(
 'plan',c.plan,'settings',c.settings,'actor',jsonb_build_array(c.actor_type,c.actor_id),
 'targets',(select jsonb_agg(jsonb_build_array(t.position,g.id,g.identity,g.url,g.updated_at,g.review_status,g.rule_evidence,g.last_reviewed_at,g.marketing_evidence) order by t.position)
   from public.campaign_targets t join public.saved_groups g on g.id=t.group_id where t.campaign_id=c.id),
 'media',(select jsonb_agg(jsonb_build_array(m.position,m.object_path,m.manifest,m.uploaded) order by m.position) from public.campaign_media m where m.campaign_id=c.id)
 )::text,'UTF8')),'hex') from public.campaign_jobs c where c.id=p_id
$$;
create function staysuite_campaign_private.rules_ready(p_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select not exists(select 1 from public.campaign_targets t
 join public.campaign_jobs c on c.id=t.campaign_id left join public.saved_groups g on g.id=t.group_id
 where c.id=p_id and (g.user_id is distinct from c.user_id or g.review_status is distinct from 'reviewed'
 or btrim(coalesce(g.rule_evidence,''))='' or g.last_reviewed_at is null or g.last_reviewed_at>now() or g.last_reviewed_at<=now()-interval '30 days'
 or g.marketing_evidence->>'promotion_allowed' is distinct from 'true'
 or g.marketing_evidence->>'source_url' is distinct from g.url
 or not coalesce((g.marketing_evidence->>'observed_at') ~ '^\d{4}-\d{2}-\d{2}T',false)
 or (g.marketing_evidence->>'observed_at')::timestamptz>now()
 or (g.marketing_evidence->>'observed_at')::timestamptz<=now()-interval '7 days'))
$$;

create function staysuite_campaign_private.quiet_until(p_now timestamptz) returns timestamptz
language sql immutable security invoker set search_path='' as $$
 select case when (p_now at time zone 'Asia/Manila')::time>=time '22:00'
 then (date_trunc('day',p_now at time zone 'Asia/Manila')+interval '1 day 7 hours') at time zone 'Asia/Manila'
 when (p_now at time zone 'Asia/Manila')::time<time '07:00'
 then (date_trunc('day',p_now at time zone 'Asia/Manila')+interval '7 hours') at time zone 'Asia/Manila'
 else p_now end
$$;

create function public.campaign_command(p_id uuid,p_revision integer,p_command text,p_payload jsonb default '{}'::jsonb)
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
   if p_command not in ('report','recover','inspect') and c.revision is distinct from p_revision then raise exception 'Campaign changed; reload' using errcode='40001'; end if;
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
   if p_payload->>'digest' is distinct from digest_now then raise exception 'Review the current campaign version' using errcode='40001'; end if;
   update public.campaign_jobs set state='ready',approved_digest=digest_now,stop_reason=null where id=c.id;
 elsif p_command in ('start','resume','claim') then
   perform pg_advisory_xact_lock(hashtextextended(u::text||':'||c.actor_type||':'||c.actor_id,0));
   if c.state not in ('ready','running','paused') then raise exception 'Campaign cannot start' using errcode='22023'; end if;
   if not exists(select 1 from public.campaign_publishers where method=c.settings->>'method' and enabled and verified_at is not null) then raise exception 'Publishing adapter is not validated; nothing sent' using errcode='55000'; end if;
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
       if found then update public.campaign_targets set state='claimed',attempt_token=gen_random_uuid(),claimed_at=now(),lease_until=now()+interval '90 seconds' where id=t.id;
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
   target_url:=p_payload->>'post_url';
   if p_payload->>'outcome' in ('live','pending_admin') and target_url is null then raise exception 'A matching post URL is required' using errcode='22023'; end if;
   if target_url is not null and (target_url !~ '^https://www\.facebook\.com/groups/[^/?#]+/posts/[0-9]+/?$' or split_part(target_url,'/',5)<>(select split_part(url,'/',5) from public.saved_groups where id=t.group_id)) then raise exception 'A matching group post URL is required' using errcode='22023'; end if;
   -- Outcomes remain client reports, not independently verified Facebook analytics.
   update public.campaign_targets set state=case when lease_until<now() then 'uncertain' else p_payload->>'outcome' end,post_url=target_url,receipt_source='extension_report',outcome_at=now() where id=t.id returning * into t;
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
revoke all on function public.campaign_command(uuid,integer,text,jsonb) from public,anon;
grant execute on function public.campaign_command(uuid,integer,text,jsonb) to authenticated;
revoke all on all functions in schema staysuite_campaign_private from public,anon,authenticated;

-- Private, immutable uploads. No UPDATE policy: an approved asset cannot be overwritten.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('campaign-media','campaign-media',false,52428800,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']);
create policy campaign_asset_read on storage.objects for select to authenticated using(bucket_id='campaign-media' and exists(select 1 from public.campaign_media m join public.campaign_jobs c on c.id=m.campaign_id where m.object_path=name and c.user_id=(select auth.uid())));
create policy campaign_asset_insert on storage.objects for insert to authenticated with check(bucket_id='campaign-media' and exists(select 1 from public.campaign_media m join public.campaign_jobs c on c.id=m.campaign_id where m.object_path=name and c.user_id=(select auth.uid()) and c.state='draft' and not m.uploaded));
-- Asset removal is intentionally not exposed until campaign retention is implemented.
