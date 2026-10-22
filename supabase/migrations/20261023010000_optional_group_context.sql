-- UX: import names/URLs first; add hosting context later. No data rewrites.
-- Prerequisite: 20261022122018_saved_groups.sql. Apply once, transactionally.
alter table public.saved_groups drop constraint saved_groups_destination_check;
alter table public.saved_groups add constraint saved_groups_destination_check
  check (char_length(destination) = 0 or char_length(destination) between 2 and 100);
alter table public.saved_groups drop constraint saved_groups_accommodation_check;
alter table public.saved_groups add constraint saved_groups_accommodation_check
  check (accommodation in ('','Condo','Apartment','Hotel','Resort','Vacation rental'));
alter table public.saved_groups drop constraint saved_groups_audience_check;
alter table public.saved_groups add constraint saved_groups_audience_check
  check (audience in ('','Guests','Hosts'));
grant update (destination,accommodation,audience) on public.saved_groups to authenticated;
-- Ownership remains enforced by existing SELECT/UPDATE RLS policies.
