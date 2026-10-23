# Campaign execution foundation

The campaign editor can explicitly save text, selected owned groups, timing settings
and private media to the authenticated backend. Local plan approval is preparation
only. Neither saving nor local approval publishes anything to Facebook.

## Implemented contracts

`/api/campaigns` validates the real session, rejects anonymous users and cross-origin
mutations, checks viewer continuity, bounds requests, and accepts strict command
payloads. No privileged Supabase key is exposed to the browser or extension.

The additive `20261023110003_campaign_execution.sql` migration creates owner-scoped
campaign jobs, ordered targets, immutable media reservations, a private Storage
bucket and the transactional `campaign_command` RPC. Existing profiles, Auth and
saved group records are not rewritten. This migration is separate from the earlier
Phase 2 group-import migrations; do not blindly push or repair hosted history.

Approval binds a digest of content, media manifests, actor, settings and current
selected group evidence. Changes invalidate readiness. Unknown or stale rules and
missing promotional permission block approval. Claims require an enabled publisher,
matching actor, current approval and server-persisted eligibility time. At most one
submission per actor can be in flight; unresolved results block further claims
across that actor's campaigns. Quiet hours use Asia/Manila, 22:00–07:00.

Leases, revision checks and unique attempt tokens prevent duplicate claims.
Expected stale-version conflicts use SQLSTATE `PT409`, not `40001`: PostgREST 14
can infinitely retry manually raised serialization failures. See [Supabase's
troubleshooting note](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b). Expired
or lost submissions become uncertain and are never automatically requeued. A late
result can be recorded after pause/cancellation without restarting the campaign.
Reported outcomes remain extension reports or explicit owner records, not
independently verified Facebook analytics.

Media uses owner-scoped reservations and signed uploads. Objects cannot be overwritten
after upload approval. Client validation checks signatures, sizes and hashes; the
experimental publisher also rehashes bytes before attaching. Storage reconciliation
checks object size, not independent server-side media decoding or malware scanning.
There is no user-facing media deletion/retention job yet.

## Publishing gate and remaining integration

Both publisher methods are disabled in the database. The API advertises publishing
as unavailable, and Start/Resume remain disabled in the UI. Do not enable a method
merely because fixture tests pass.

The isolated Classic adapter inspects the public Facebook actor and visible composer,
preserves existing drafts, checks exact content/media, stops on warnings and requires
an explicit confirmation plus a matching group post URL for a successful receipt.
A link alone is uncertain. It is not connected to extension runtime messages and
has not been validated in the owner's authenticated Facebook browser.

Still required before live campaign execution: authenticated dashboard/extension
actor binding, runtime messaging, durable scheduling/worker recovery, restored draft
editing and a specifically approved live adapter validation. The queue supports
explicit owner review of uncertain/stopped outcomes without resubmitting.
Direct private-endpoint publishing, Page support, native multi-group posting,
first comments, AI rewriting and unattended scheduling are not implemented.
No pacing setting guarantees avoidance of account restrictions or bans.

## Verification

- PGlite executes the actual migration and tests ownership, denied direct writes,
  approval invalidation, persisted waits, interrupted claims and immutable Storage RLS.
- API tests cover session/origin/viewer guards and signed upload reservations.
- Executor tests verify no dispatch on disabled claims, stale approvals or actor changes,
  and no automatic retry after ambiguous publication.
- Playwright Classic tests intercept all requests and use synthetic Facebook HTML;
  they never connect to Facebook or publish a real post.
- `test-supabase-auth.mjs` also runs `test-campaign-queue.mjs` only against its
  disposable loopback Supabase stack. This checks actual signed uploads and concurrent
  PostgREST claims, then removes its own fixture records and disables the test publisher.
  These checks require local Docker/Supabase or the isolated CI job.
