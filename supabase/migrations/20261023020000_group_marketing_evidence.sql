-- Aggregate user-supplied observations only. No profile/Auth or policy changes.
alter table public.saved_groups add column marketing_evidence jsonb not null default '{}'::jsonb
  check (jsonb_typeof(marketing_evidence)='object' and octet_length(marketing_evidence::text)<=8000
    and marketing_evidence - array['observed_at','source_url','posts_7d','sample_posts','sample_comments','enquiries_30d','bookings_30d','promotion_allowed']::text[] = '{}'::jsonb);
grant update(marketing_evidence) on public.saved_groups to authenticated;
-- Existing ownership RLS still governs access; no member/post/message storage.
