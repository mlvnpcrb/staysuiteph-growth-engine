# Evidence-based group marketing ranking (v1)

Implemented locally on 23 October 2026 (Asia/Manila). No posting, authentication,
Production, push or deployment changes are included. No paid AI/search key is needed.

## Use it

In **My Groups**, each saved group has **Marketing potential**. Open **Record
marketing evidence**, enter an observation date and that group's source URL,
then record aggregate counts you personally observed. Leave unavailable values
blank; measured zero is different from unknown. Do not enter member identities,
messages, comments, contact details or client names. Save to update ranking, or
clear only marketing evidence without clearing notes/rule reviews.

- Posts: observed total during the preceding 7 days.
- Sampled posts/comments: count a sample of posts from the preceding 7 days and
  the total comments on that sample. Record both to calculate comments per post.
- Enquiries/bookings: your own attributed counts during the preceding 30 days.
  These are self-reported outcomes, not verified conversions or causal attribution.
- Promotion permission: your personal rule check; Unknown is the default. This
  does not replace fresh existing rule evidence and review confirmation.
- Dates display in Asia/Manila. The date-only observation input is stored at
  00:00 Asia/Manila for that date (UTC timestamp); freshness therefore expires
  conservatively rather than inferring an unknown observation time.

**Rank groups** offers Marketing priority, Evidence coverage, or Newest saved.
Marketing priority puts reviewed permission first, needs-review groups next and
blocked groups last, then sorts by score/coverage/name. Permission filters let you
isolate those categories. Ranking is over the loaded shortlist (up to 500 groups).
A reviewed-permission label is not authorization to publish or proof of Facebook
membership/eligibility. No campaigns or posting are enabled by this feature.

## Transparent scoring

| Dimension | Maximum | Rule |
| --- | ---: | --- |
| Audience/location fit | 30 | 10 for each supplied-text match: destination, accommodation and audience. Requires valid hosting context. |
| Recent activity | 20 | 0/1/3/7 posts earn 0/6/12/20 points. |
| Sample engagement | 20 | 0/positive/2/5 average comments per sampled post earn 0/6/12/20 points. Requires a nonzero sample size. |
| Your enquiries | 15 | 0/1/5 enquiries earn 0/8/15 points. |
| Your bookings | 15 | 0/1/2 bookings earn 0/10/15 points. |

These thresholds are product heuristics, not industry research, expected reach,
ban-safe schedules or predicted bookings. Unknown dimensions add no points and
are not rescaled. With no usable dimensions the score is **Insufficient evidence**,
not an invented zero. Evidence coverage is the sum of weights with usable data.
Confidence is low unless coverage is at least 70% and the engagement sample is at
least 10 posts; even moderate confidence remains based on unverified user reports.

Aggregate observations must be younger than 7 days, not future-dated, and cite
this exact saved group identity. Stale/missing/invalid/wrong-group evidence is
Unknown. Rule review follows the existing 30-day freshness check. Explicitly
prohibited promotion or Not suitable blocks campaign planning; missing permission
or stale rules also blocks planning until review. A high score does not override
these gates. Member quality, spam prevalence, impressions, reach and true causal
return are not automatically measured. No Facebook scraping/private APIs run.

## Persistence and security

The authenticated same-origin `/api/groups` PATCH operation `marketing_evidence`
validates counts, date, allowed keys and source URL, verifies ownership, rejects
future dates and mismatched groups, and updates only the owner's evidence field.
Existing notes/context/rule reviews are not rewritten. No derived score is accepted
from the client or stored as authoritative. Malformed stored evidence is ignored
rather than breaking the saved-group list or adding points.

`supabase/migrations/20261023020000_group_marketing_evidence.sql` adds one JSONB
column defaulting to `{}`, with object/size/key-whitelist constraints and an
UPDATE grant for that column. Existing SELECT/UPDATE ownership RLS remains intact.
No table, policy, profile, Auth object, owner registry or existing row is reset.

**Prepared only, not applied live.** For accumulated local work, the migration
order after the existing saved_groups base is:
1. `20261023010000_optional_group_context.sql` (previous UX milestone).
2. `20261023020000_group_marketing_evidence.sql` (this milestone).

The new evidence migration itself only requires the saved_groups base table.
Verify live project target/schema/state and obtain explicit SQL approval before
applying any pending migration transactionally once. Do not rerun creation
migrations, reset a database, repair history or run db push for this work.
Until the evidence migration is present, existing groups can display their text
fit, but saving the new evidence field requires that prepared schema change.

## Validation and manual acceptance

Automated tests cover missing/stale/future/foreign evidence, zeros, bounds, private
fields, readiness, score explanations, malformed stored data, API ownership,
source binding, isolated SQL preservation/RLS, sorting/filters, persistence/clear,
responsive layout and light/dark accessibility. Test counts are in the completion
report. Browser tests use synthetic data and mocked backend responses; database
checks run in isolated PGlite, not the hosted project.

After approved schema setup in a local/test database, use My Groups to record
counts for one existing group, check the breakdown, save/reload, filter/sort, then
clear evidence and confirm notes/rule reviews remain. Verify invalid sources and
future dates are rejected. Use your existing account; no new permanent users are
needed. Hosted persistence/live Google session checks have not been rerun here.
Native extension installation remains blocked by browser administrator policy;
this ranking feature does not require the extension for already-saved groups.

## Recorded checks

Frozen installation, lint, strict TypeScript, dashboard/extension builds and MV3
verification: PASS. Vitest: 182 PASS; Node script tests: 3 PASS (185 total).
Playwright: 84 PASS across desktop/tablet/mobile, including the new evidence,
ranking, clear/persistence and accessible-theme scenarios. The sample-size
consistency guard rejects a sample larger than a known observed 7-day post total.
Native extension installation: BLOCKED by administrator policy. Isolated migration
and RLS tests passed; no hosted schema change or live authorization claim is made.

## Available-evidence posting recommendations

My Groups now includes “Where to post first” on each card. Without activity data,
name-based triage distinguishes accommodation groups, host referral communities,
mixed property/travel audiences and names without an accommodation match. Host
communities are not represented as guest demand. Mixed sale/long-term groups
require additional audience review. Explicit unsuitability or fresh promotion
denial overrides topic fit. These recommendations break ties in marketing ranking
after permission, score and coverage; they never add marketing score points.
No location is assumed and no activity, competition, reach or buyer intent is
invented. Recommendations run on existing saved data without new collection,
API calls, database writes or migrations.
