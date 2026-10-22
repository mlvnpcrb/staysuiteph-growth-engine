# Phase 2 — Group Finder MVP

Implemented locally on `feat/phase-2-group-finder` in a separate worktree. Baseline:
`75fd080d150e99db5e2895edf27afccbdf7a1e77`, the verified remote Phase 1 head associated
with GitHub PR #1's latest Vercel Ready report (deployment `6ZFBbsLRw9E3pVcSSd3Uxqtquv2E`,
canonical feature Preview). Direct authenticated Vercel runtime metadata is unavailable;
no Preview alias or settings were changed. Owner-only commits/SQL and all uncommitted
Phase 1 work remain in the original worktree, excluded from this branch.

## Working features

- Group Finder: destination/accommodation/audience, URL-persisted search context, useful
  Facebook/web searches, validated manual links and evidence, normalized group identity.
- Assessment: transparent keyword-based relevance, reasons, confidence and unknowns. No
  search or AI provider/key was configured; no AI request runs and no discovered groups,
  member counts, rules, activity or publishing permission are invented. User-entered
  information is explicitly unverified. No Facebook page is fetched server-side.
- My Groups: idempotent per-user saving, saved-list filtering, private notes edit/clear,
  rule excerpts, explicit personal-review confirmation/date, 30-day review freshness,
  external group links and confirmed shortlist removal. Editing only notes preserves
  the review date. Changing evidence resets the UI review status.
- Overview: exact saved/review counts from authenticated database count queries and
  recent saved-record updates. My Groups currently shows the latest 500 records and
  filters that loaded list; counts include all records, and the UI discloses the limit.
- Responsive themes, accessible forms, loading/empty/success/error/retry states.

## Architecture and files

`apps/web/src/components/groups/` contains Finder, shortlist, Overview and the validated
API client. `/api/groups` verifies existing Supabase sessions for every operation, rejects
anonymous Auth users, validates mutations and checks same-origin requests. User IDs come
from Auth, never payloads. `packages/database/src/groups.ts` scopes SDK queries to that
identity; database RLS independently isolates rows. Existing login, callback, session,
profile policies and extension code are unchanged. No service-role key is required.

Contracts live in `packages/types/src/groups.ts`; URL/input/response schemas and pure
assessment/overview functions live in `packages/validation/src/`. Only a workspace type
package dependency was added; third-party dependency versions are unchanged.

## Exact migration and approval-required application

Only new migration: [20261022122018_saved_groups.sql](../supabase/migrations/20261022122018_saved_groups.sql).
It adds `public.saved_groups`, keeping latest notes and rules-review metadata on each saved
entry, with `(user_id, identity)` uniqueness, an owner/activity index, forced RLS, four
ownership policies, column-specific grants and an invoker timestamp trigger. This MVP
stores the latest review, not a historical audit log. No profiles/Auth rows or existing
policies are altered. It does not require or include the pending owner-only migration.

After separate live-SQL approval:

1. Confirm hosted project `kqjqcahysbmsaxlaipub`, inspect actual schema, and ensure
   `saved_groups` and `touch_saved_group()` do not already exist. Confirm original
   profile objects already exist; never rerun their creation migrations.
2. In that project's SQL Editor, execute `BEGIN;`, the **entire exact new migration**,
   then `COMMIT;` as one request. Stop/roll back on errors; do not reset, drop existing
   objects or apply the parked owner-only SQL. Do not run db push or migration repair
   as part of these instructions. Migration-history reconciliation is separate.
3. Verify enabled/forced RLS, all four owner policies, least-privilege grants and unchanged
   profile schema/data. Test save/read/notes/review/remove with an authenticated session.
4. A hosted test or deployment requires separate approval; none was performed here.

Run locally with existing `apps/web/.env.local` Supabase URL/publishable key configured
privately and `STAYSUITE_DEMO_MODE=false`. Existing Google login configuration stays as-is.
For disposable development, apply migrations only to a separately configured local test
stack. Without a configured database/new table, search and assessment still work and
persistence displays an honest unavailable state. Demo does not authorize backend writes.

## Validation

- Unit tests exercise normalization, unsafe links, fallback discovery, assessment unknowns,
  reviews, Overview calculations, API authentication/CSRF/validation and SDK persistence/
  duplicate handling. SDK HTTP fixtures are mocked, not hosted PostgREST verification.
- Embedded PostgreSQL executes the exact new migration and tests real role-based policies,
  both directions of isolation, duplicate constraints, notes/review/removal, immutable
  metadata and anonymous denial. No permanent or hosted users are created.
- Browser fixtures cover the connected workflow, reload persistence in that fixture,
  failure/retry, responsive layouts and accessible light/dark forms. They do not establish
  hosted database, Google OAuth or real Facebook/search-provider integration.

Live schema application, hosted persistence and actual deployment remain NOT VERIFIED.
No GitHub push, Vercel deployment, PR merge, live SQL, Auth configuration or Production
change was made. The leaked-password protection warning remains unresolved; it is not
changed or claimed fixed by this product implementation.

Actual local results for this implementation:

| Check | Result |
| --- | --- |
| Frozen installation | PASS |
| Lint and TypeScript | PASS |
| Automated suite | PASS: 115 Vitest + 3 Node tests (118 total) |
| Production dashboard and extension builds | PASS; both built, MV3 manifest verified |
| Playwright | PASS: 48 desktop/tablet/mobile checks, including connected backend fixtures and light/dark accessibility |
| pgTAP (`pnpm db:test`) | BLOCKED: local PostgreSQL 127.0.0.1:54322 unavailable (exit 1) |
| Native extension install | BLOCKED: browser administrator policy (exit 2); HTTP popup harness passed separately |
| Authentication/profile/extension source preservation | PASS: unchanged against baseline |

Only a new live saved-groups migration, GitHub push and Preview deployment require future
approval to make this MVP available on the hosted Preview. Search/AI provider integrations
are optional future additions; current honest fallbacks work without credentials. No
pending owner-only SQL or Auth changes are included in this branch.

## Free joined-group collection follow-up

The extension now offers an experimental user-triggered visible-name/link collector
with local JSON export and dashboard bulk import, assessment and selected saving.
See [JOINED_GROUP_COLLECTION.md](JOINED_GROUP_COLLECTION.md) for installation,
permissions, privacy boundaries, limitations and manual acceptance. This adds no
paid provider requirement, authentication change, or migration.

## Connected Group Import milestone

The extension can now send checked groups directly into Group Finder's validated
preview. Explicit saving uses the existing authenticated API/RLS, with per-group
success/duplicate/failure states and safe partial-batch retry. No posting, auth
change or migration is included. See [CONNECTED_GROUP_IMPORT.md](CONNECTED_GROUP_IMPORT.md).
