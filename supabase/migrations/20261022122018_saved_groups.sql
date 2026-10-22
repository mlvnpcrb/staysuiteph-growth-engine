-- Phase 2 only. Independent of the unshipped owner-only migration.
create table public.saved_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  identity text not null check (identity ~ '^[a-z0-9._-]{1,160}$'),
  url text not null check (url = 'https://www.facebook.com/groups/' || identity || '/'),
  title text not null check (char_length(title) between 2 and 160),
  destination text not null check (char_length(destination) between 2 and 100),
  accommodation text not null check (accommodation in ('Condo','Apartment','Hotel','Resort','Vacation rental')),
  audience text not null check (audience in ('Guests','Hosts')),
  evidence text not null default '' check (char_length(evidence) <= 2000),
  source text not null default 'manual' check (source = 'manual'),
  notes text not null default '' check (char_length(notes) <= 4000),
  review_status text not null default 'review_required' check (review_status in ('review_required','reviewed','not_suitable')),
  rule_evidence text not null default '' check (char_length(rule_evidence) <= 4000),
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, identity),
  check (review_status <> 'reviewed' or (length(trim(rule_evidence)) > 0 and last_reviewed_at is not null))
);
create index saved_groups_user_updated_idx on public.saved_groups(user_id,updated_at desc);
alter table public.saved_groups enable row level security;
alter table public.saved_groups force row level security;
revoke all on public.saved_groups from public, anon, authenticated;
grant select, delete on public.saved_groups to authenticated;
grant insert (user_id,identity,url,title,destination,accommodation,audience,evidence) on public.saved_groups to authenticated;
grant update (notes,review_status,rule_evidence,last_reviewed_at) on public.saved_groups to authenticated;
create policy saved_groups_select_owner on public.saved_groups for select to authenticated using ((select auth.uid())=user_id);
create policy saved_groups_insert_owner on public.saved_groups for insert to authenticated with check ((select auth.uid())=user_id);
create policy saved_groups_update_owner on public.saved_groups for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy saved_groups_delete_owner on public.saved_groups for delete to authenticated using ((select auth.uid())=user_id);
create function public.touch_saved_group() returns trigger language plpgsql security invoker set search_path='' as $$
begin new.updated_at=now(); return new; end;
$$;
revoke all on function public.touch_saved_group() from public, anon, authenticated;
create trigger saved_groups_touch before update on public.saved_groups for each row execute function public.touch_saved_group();
