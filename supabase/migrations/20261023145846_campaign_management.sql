-- Campaign management only; publisher availability remains unchanged.
alter table public.campaign_jobs add column title text not null default '' check(length(title)<=120), add column description text not null default '' check(length(description)<=2000);

-- Preserve the reviewed execution state machine behind an owner-checked wrapper.
alter function public.campaign_command(uuid,integer,text,jsonb) set schema staysuite_campaign_private;
revoke all on function staysuite_campaign_private.campaign_command(uuid,integer,text,jsonb) from public,anon,authenticated;
create function public.campaign_command(p_id uuid,p_revision integer,p_command text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_command in ('create','edit') then
   if (p_payload ? 'title' and (jsonb_typeof(p_payload->'title')<>'string' or length(p_payload->>'title')>120)) or (p_payload ? 'description' and (jsonb_typeof(p_payload->'description')<>'string' or length(p_payload->>'description')>2000)) then raise exception 'Check title and description' using errcode='22023'; end if;
   result:=staysuite_campaign_private.campaign_command(p_id,p_revision,p_command,p_payload-array['title','description']);
   update public.campaign_jobs set title=coalesce(p_payload->>'title',title),description=coalesce(p_payload->>'description',description) where id=p_id and user_id=auth.uid();
   return staysuite_campaign_private.campaign_command(p_id,0,'inspect','{}');
 end if;
 return staysuite_campaign_private.campaign_command(p_id,p_revision,p_command,p_payload);
end $$;
revoke all on function public.campaign_command(uuid,integer,text,jsonb) from public,anon;
grant execute on function public.campaign_command(uuid,integer,text,jsonb) to authenticated;

create or replace function staysuite_campaign_private.snapshot(p_id uuid) returns text
language sql stable security invoker set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_object(
 'plan',c.plan,'title',c.title,'description',c.description,'settings',c.settings,'actor',jsonb_build_array(c.actor_type,c.actor_id),
 'targets',(select jsonb_agg(jsonb_build_array(t.position,g.id,g.identity,g.url,g.updated_at,g.review_status,g.rule_evidence,g.last_reviewed_at,g.marketing_evidence) order by t.position)
   from public.campaign_targets t join public.saved_groups g on g.id=t.group_id where t.campaign_id=c.id),
 'media',(select jsonb_agg(jsonb_build_array(m.position,m.object_path,m.manifest,m.uploaded) order by m.position) from public.campaign_media m where m.campaign_id=c.id)
 )::text,'UTF8')),'hex') from public.campaign_jobs c where c.id=p_id
$$;

-- Freeze before removing objects via Storage API. Never delete storage metadata by SQL.
create function public.campaign_delete(p_id uuid,p_revision integer,p_finish boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.campaign_jobs;
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Sign in required' using errcode='42501'; end if;
 select * into c from public.campaign_jobs where id=p_id and user_id=auth.uid() for update;
 if not found then raise exception 'Campaign not found' using errcode='42501'; end if;
 if c.revision is distinct from p_revision then raise exception 'Campaign changed; reload' using errcode='PT409'; end if;
 if c.state='running' or exists(select 1 from public.campaign_targets where campaign_id=c.id and state in('claimed','uncertain','stopped')) then raise exception 'Stop and resolve outstanding submissions before deleting' using errcode='55000'; end if;
 if p_finish then
   if c.state<>'cancelled' or c.stop_reason is distinct from 'Removing campaign and private media' then raise exception 'Prepare deletion first' using errcode='22023'; end if;
   if exists(select 1 from storage.objects o join public.campaign_media m on o.bucket_id='campaign-media' and o.name=m.object_path where m.campaign_id=c.id) then raise exception 'Remove private files first' using errcode='55000'; end if;
   delete from public.campaign_media where campaign_id=c.id;
   delete from public.campaign_targets where campaign_id=c.id;
   delete from public.campaign_jobs where id=c.id;
   return jsonb_build_object('deleted_id',c.id);
 end if;
 update public.campaign_jobs set state='cancelled',approved_digest=null,stop_reason='Removing campaign and private media',revision=revision+1,updated_at=now() where id=c.id;
 return staysuite_campaign_private.campaign_command(c.id,0,'inspect','{}');
end $$;
revoke all on function public.campaign_delete(uuid,integer,boolean) from public,anon;
grant execute on function public.campaign_delete(uuid,integer,boolean) to authenticated;
create policy campaign_asset_delete on storage.objects for delete to authenticated using(bucket_id='campaign-media' and exists(select 1 from public.campaign_media m join public.campaign_jobs c on c.id=m.campaign_id where m.object_path=name and c.user_id=(select auth.uid()) and c.state='cancelled' and c.stop_reason='Removing campaign and private media'));
notify pgrst,'reload schema';
