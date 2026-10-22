# My Groups import experience

23 October 2026 (Asia/Manila). This supersedes the Group Finder import UX in
CONNECTED_GROUP_IMPORT.md. Changes are local only: no push, deployment, live SQL
or authentication change is included.

## Seven UX changes

1. My Groups contains **Import from Facebook**, beside the saved-group workspace.
   The extension opens and sends to `/dashboard/my-groups`; Group Finder remains
   for search/assessment. Status labels are Extension needed, Ready to collect,
   and Groups received. A helper message is not Facebook Login or authenticated
   extension identity; it never authorizes a server operation.
2. Select in the extension once. The dashboard shows a preview with new groups
   preselected and one **Import N groups** action. Change selection is optional;
   it reveals controls only when needed. A filter changes visibility, not selection.
3. Names and links are sufficient. Hosting context is stored as empty strings,
   never fabricated destination/accommodation/audience values. Add it later in
   the saved group's **Notes & rule review → Hosting context (optional)**. Text
   relevance appears once all context fields are valid. Posting permission remains
   unverified regardless of score.
4. A server-validated, same-origin duplicate check queries only the signed-in
   user's requested identities (up to 100), independent of the UI's 500-row list
   limit. Existing groups are labeled **Already saved**, excluded by default and
   cannot be selected for overwrite. The existing database uniqueness/upsert also
   handles a concurrent save after preview. Existing notes/rule reviews are kept.
5. Results stay in the preview as **N imported · N already saved · N failed**,
   with per-row states, View My Groups, and **Retry failed (N)**. Retrying sends
   only failed rows; completed imports are not resent. An error stops the batch.
   Unattempted rows remain eligible for the main Import action. Stop import takes
   effect after the in-flight request. Reloading clears the preview but not saved
   groups; no new import-history table was introduced.
6. The visibility limit is next to the entry point: “Collects groups currently
   visible on your Facebook page. Scroll to load more.” Setup/privacy/file-fallback
   details are expandable. Only names/links from the existing visible collector
   are accepted. No all-joined-groups or official Facebook connection is claimed.
7. Recovery actions match the failure: retry collection for collection failures,
   Open dashboard / Try sending again for delivery, Retry duplicate check before
   unchecked imports, and Retry failed after a partial save. Permissions remain
   optional, scoped to the configured StaySuite host. No cookies/tokens are passed.

## Required schema change (prepared, not applied)

`supabase/migrations/20261023010000_optional_group_context.sql` requires the existing
saved_groups table from `20261022122018_saved_groups.sql`. It widens three CHECK
constraints to permit empty context values and grants UPDATE on those three
columns to authenticated users. Existing ownership RLS remains the authorization
boundary. It changes no rows, profiles, Auth objects, indexes, owner registry or
parked owner-only migration, and adds no table or policy.

Apply this new migration once, transactionally, only after live project-target
and migration-state verification and explicit live SQL approval. Do not rerun
creation migrations, repair migration history, or run db push as part of this UX
change. The older schema rejects context-free imports until this migration is
applied. No automatic live migration was performed. Existing migrations do not
need to be rewritten or reset.

For isolated/local testing, the automated PGlite test builds the base schema,
seeds an existing row, applies the new SQL in one transaction, verifies unchanged
rows/policies, imports without context, updates the owner's context, checks
cross-user denial, checks anonymous denial and preserves server-owned columns.

## Desktop acceptance checklist

Use the matching local dashboard and extension build 0.0.3 (not the unchanged
Vercel Preview). Follow README for local Supabase env configuration. The local
database must contain saved_groups and the new optional-context migration before
attempting context-free persistence. Keep demo mode off for real session tests.

- Sign in to StaySuite locally. Open My Groups.
- Load/reload `apps/extension/build/chrome-mv3-prod` at chrome://extensions.
- Open Facebook Your Groups, authorize visible collection, select groups, and
  Send to StaySuite. Allow the optional StaySuite host grant when Chrome asks.
- Confirm Groups received, previewed names, New/Already saved labels, and that
  existing groups are excluded. Import without entering destination details.
- Confirm aggregate/per-row results. Open saved entries, add hosting context and
  verify it persists after reload. Confirm existing notes/rule reviews remain.
- Reimport the same groups and verify Already saved without overwrites.
- Interrupt a save or use a controlled backend failure; verify completed imports
  remain and Retry failed does not resubmit them. Restore connectivity and retry.
- Deny site access or sign out; verify a recovery action rather than false success.

Native installation/live Facebook remain environment-blocked by Chrome
administrator policy. Browser tests use synthetic pages and a compiled-function
isolated-world bridge harness; they do not prove real Facebook layout behavior or
hosted persistence. No automatic posting is implemented by this milestone.

## Automated checks

- Frozen pnpm installation: PASS (unchanged optional native build-script warnings).
- ESLint and strict TypeScript: PASS.
- Vitest: 171 PASS; Node script tests: 3 PASS (174 total).
- Dashboard and extension production builds / MV3 permission verification: PASS.
- Playwright: 78 PASS across desktop/tablet/mobile, including light/dark automated
  accessibility checks and production-bundled isolated-world bridge tests.
- Optional-context SQL: PASS in isolated PGlite tests; never applied live.
- Native extension installation: BLOCKED, `Extensions.loadUnpacked: Loading of
  unpacked extensions is disabled by the administrator.` Live Facebook and hosted
  persistence remain manual checks; no Chrome policy was bypassed.
