-- Foundation identity only. No Facebook or campaign data is collected.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
revoke all on public.profiles from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
create policy profiles_select_owner on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy profiles_insert_owner on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy profiles_update_owner on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
