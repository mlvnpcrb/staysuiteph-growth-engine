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
The later campaign-management migration adds explicit campaign/file deletion; there is no automatic retention job.

## Publishing gate and remaining integration

Both publisher methods are disabled in the database. The API advertises publishing
as unavailable, and Start/Resume remain disabled in the UI. Do not enable a method
merely because fixture tests pass.

The isolated Classic adapter inspects the public Facebook actor and visible composer,
preserves existing drafts, checks exact content/media, stops on warnings and requires
an explicit confirmation plus a matching group post URL for a successful receipt.
A link alone is uncertain. It is connected to a gated extension campaign workspace and
has not been validated in the owner's authenticated Facebook browser.

The later workspace supplies dashboard/profile binding, foreground execution and
restored draft editing. A specifically approved live adapter validation is still
required before automatic submission. Unattended background scheduling is not implemented. The queue supports
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

## Campaign management and extension workspace (23 October 2026)

The owner approved the campaign execution migration on 23 October. It was applied
through the connected Supabase migration tool, transactionally; all four campaign
tables have RLS and campaign-media is private. Existing groups/profiles were not
modified. Publisher flags remain disabled. Legacy history is not reconciled by
this work; do not run db push based on the hosted migration listing.

The separate CLI-generated campaign_management migration adds private title/notes,
includes them in approval digests, and wraps the existing execution state machine.
Reopening retrieves signed private objects, verifies signatures/size/SHA-256, and
restores editable text, targets and timing. Duplicate creates an unsaved copy,
requiring an explicit save and fresh approval. Uploaded bytes remain immutable;
duplicate to replace them. Deletion first freezes the job, removes its objects
through Storage's API, then deletes metadata transactionally. It rejects running,
in-flight or unresolved submissions, owner changes and stale revisions. Failed
object removal leaves a cancelled, retryable job rather than an orphan cleanup
claim. Saved groups are not deleted.

Extension 0.3.0 adds a separate campaign workspace opened from the popup. It asks
for only the selected StaySuite host and Facebook, sends backend requests inside
the authenticated dashboard's isolated world, and never exports session cookies.
Public Facebook page identity is checked before approval and each dispatch. The
workspace binds the chosen profile, approves the saved digest, and can inspect a
visible composer with allowSubmit=false (no text insertion or publishing). It
supports personal profiles only. Page and Direct adapters remain unavailable.

The sequential execution bridge connects server claims/recovery to the isolated
Classic adapter. Backend eligibility survives workspace restarts. The foreground
runner requires its extension workspace and signed-in dashboard tab to remain
open; it is not an unattended background scheduler. Closing/reloading never
automatically resumes a run. Lost claims must be recovered/reviewed in the queue.
Stop permits a submission already in flight to finish and pauses subsequent work.
The adapter has a 20 MB dispatch limit even though private draft storage accepts
50 MB. Claims still require an enabled, live-validated publisher. This release
DOES NOT enable that flag or claim live Facebook publication compatibility.
A composer check, fixture tests, account access and broad implementation approval
are not proof that real uploads/submission/receipts work. A specifically selected
campaign and group need owner-operated live validation before automatic submission
can be enabled. No Facebook posts were sent during implementation.

CI now exercises real editor create/title/notes/image save, reload, signed image
retrieval, edit, duplication and deletion against disposable Supabase. Hosted
Google completion and installed-owner-extension execution are separate evidence
boundaries; do not relabel these CI results as deployed OAuth/posting proof.

Hosted evidence: project kqjqcahysbmsaxlaipub now records campaign_execution
(20261023145734) and campaign_management (20261023152634) via the official
connected migration tool. These generated hosted versions map to the reviewed
local files 20261023110003 and 20261023145846 respectively. Earlier group-schema
history is still absent and has not been fabricated or replayed. The initial
management apply returned invalid_request_state; schema/history inspection
confirmed it had not applied before one successful retry.

Hosted verification ran role-scoped create/edit/inspect/delete, wrong-owner denial
and direct publisher-write denial inside a rolled-back transaction. It left zero
campaigns, 180 groups and the existing profile count unchanged. This tests actual
hosted Postgres commands/RLS, not Google OAuth, browser cookies or Storage uploads.
The full signed upload/CRUD browser flow passed against disposable CI Supabase.

The security advisor reports two intentional authenticated SECURITY DEFINER RPCs:
campaign_command and campaign_delete. They use an empty search_path, validate
non-anonymous auth.uid ownership and revisions, deny direct client table writes,
and expose neither anonymous execution nor private helpers. Wrong-owner/anonymous
access is tested. The advisory is tracked rather than removing the command-only
write boundary. Reference:
https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
The pre-existing leaked-password protection warning remains; Auth configuration
was not changed.

Dispatch additionally requires the same still-active, unexpired server claim after
media downloads/navigation. The page adapter receives the lease deadline and
checks it during its guarded waits and before submitting. Expiry before a click
sends nothing; an interrupted/expired dispatched action remains uncertain and is
never automatically retried.

## Owner-controlled live validation (extension 0.3.2)

The owner requested continuation until publishing works. A fresh, saved and
backend-approved campaign can now perform ONE explicitly authorized validation
post to its displayed first group. The UI requires a separate one-post consent
and a confirmation dialog naming that group, profile and attachment count. This
is an actual Facebook submission when operated in the owner's browser, not a
composer-only check. Implementation/CI does not operate that live button.

The transactional validate_one command validates ownership, revision, actor,
current exact approval/group permissions, media bounds and server eligibility. It
claims only the first target, allows at most one validation attempt per campaign,
and uses the same actor-wide submission lock. The normal bulk publisher flags
remain disabled. All other targets wait after the validation receipt. Unknown or
restricted outcomes hold the queue; no automatic validation retry is permitted.

Only after a matching reported post receipt exists can the owner inspect the post
and explicitly confirm_validation. That records owner-attested compatibility for
this StaySuite account, personal Facebook profile and adapter version 0.3.2. It
expires after seven days, deletion of its receipt, or a failed/uncertain subsequent
result. It is not an independent Meta verification or a ban guarantee. Other users,
profiles, adapter versions and Direct publishing do not inherit it. Confirmation
does not resume a campaign: exact review and Start are separate explicit actions.

Owner-scoped readiness is read through campaign_publisher_ready. The private
validation tables deny direct client access and have RLS. Private readiness is
exposed through an invoker wrapper; no service-role key or Facebook credential is
exported. The old global publisher flags are not enabled by this migration.

Provider diagnostics store bounded reason codes only. Download posting diagnostics
omits draft text, media names, account/group IDs, cookies, tokens and post URLs.
The Classic attachment path can open a uniquely labelled Photo/video control and
select the appropriate file input; it still stops on ambiguous UI or existing drafts.

CI additionally launches the actual native MV3 campaign workspace against real
isolated Next.js/Supabase and intercepted synthetic Facebook DOM. It exercises
private media retrieval, exact approval, one submission/receipt, explicit owner
confirmation and cleanup. Passing that test establishes integration, not live
Facebook compatibility. Hosted Google login completion and owner-session Facebook
posting remain separate, requiring the owner's browser and selected campaign.

Blocking account alert dialogs stop the Classic adapter regardless of their text.
Immediately before clicking Post, it verifies that the visible control is the
actual topmost element at its center. An overlay cannot be bypassed by calling a
covered element's click handler. No submit is recorded until that check passes.
