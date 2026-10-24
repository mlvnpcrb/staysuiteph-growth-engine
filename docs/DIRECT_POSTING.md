# Direct text and photo campaigns (0.4.0)

Extension 0.4.1 automatically detects supported open StaySuite dashboard tabs.
Connect requests optional Chrome tab-metadata permission, then grants execution
only for the selected StaySuite origin and Facebook. URL metadata is filtered
locally and is not persisted or uploaded. The active or most recently used
dashboard wins; manual URL entry is an advanced fallback. No permanent `tabs`
permission or broad permanent host access is added.

The extension can submit an approved campaign sequentially through Facebook
requests without opening each target group's composer. The editor defaults to
Direct; existing Classic drafts have an explicit “Use Direct posting for this
draft” action which clears their previous approval.

The flow is text, photos, selected groups, interval, private Save, open the
extension, review the exact campaign, and Start. Keep the extension workspace,
signed-in dashboard and Facebook tab open. Closing the workspace does not
automatically resume a run. This is a foreground sequential runner, not an
unattended scheduler. This version supports text and photos (20 MB total);
video is rejected before a story request is made.

## Protocol and reference

Original implementation based on static inspection of the owner-provided Group
Posting Pro 2.11.30 package, SHA-256
`961a77059db7198e9610dd1a81c9a84556759c013bf4ac6305895533406a52e1`.
It follows that package's photo-upload -> media identifier ->
ComposerStoryCreateMutation sequence. Current Facebook module metadata supplies
the document identifier when available; the reviewed reference's identifiers
are bounded compatibility fallbacks. No vendor service, telemetry, licensing,
anti-refusal variant, document-ID retry loop or vendor runtime is imported.

The adapter executes only in a Facebook page's MAIN world. The current personal
actor, local request/CSRF context, media signatures, SHA-256 and claim deadline
are checked before sending. CSRF values never leave the function in return
values, messages, diagnostics, logs or extension storage. No Facebook cookie,
password or OAuth access token is read by this adapter.

The story receipt must name the expected group and personal actor and contain
a numeric post ID and explicit moderation metadata. Null pending metadata means
live; true/object metadata means admin pending. Missing, inconsistent, restricted
or interrupted results are held. There is no automatic second story request after
an uncertain outcome. A same-page attempt journal prevents concurrent duplicate
injections; server claims/recovery hold dispatched work across page restarts.
Confirmed outcomes are Facebook mutation receipts, not independent analytics.

## Separate readiness and rollout

Direct 0.4.0 does not inherit Classic 0.3.2 validation. The new additive migration
`20261024083111_campaign_direct_publishing.sql` creates private Direct trial and
actor-validation tables, a separate readiness RPC, and method-aware command
routing. It keeps both global publisher flags unchanged. A missing migration
leaves Direct validation/submission disabled while saving remains available.

The existing single-post validation gate is retained for first compatibility
verification. After the owner checks and confirms that exact receipt, Direct
readiness is scoped to the StaySuite owner, Facebook personal profile and adapter
version, for seven days. An uncertain/failed result revokes it. Confirmation does
not itself start remaining groups; Start is explicit. Subsequent approved runs
proceed sequentially with the server-persisted interval.

Deploy the matching dashboard API and extension together to Preview, then apply
the separately reviewed Direct migration only to the explicitly approved project.
Do not apply this by blindly pushing the entire local migration directory: hosted
legacy migration versions differ. No hosted migration or live Facebook test is
performed by the build or protocol test.

## Validation

- `pnpm test` includes PGlite execution of the actual Direct migration, Classic
  separation, wrong-owner/version denial, interval reservation, receipt confirmation,
  sequential continuation and readiness revocation after uncertainty.
- `node scripts/test-direct-publisher.mjs` runs Chromium with every request
  intercepted. It tests media upload, exact mutation payload, live/admin-pending
  receipts, restricted uploads, actor changes, changed media, expiry, ambiguous
  receipts, concurrent calls and duplicate suppression. No live Facebook traffic.
- `scripts/test-native-campaign.mjs` is wired into the disposable Supabase auth
  suite. It tests the actual built MV3 extension, private image retrieval, first
  validation, receipt confirmation and the second group, with Facebook HTTP
  responses intercepted. It asserts zero composer clicks and no target navigation.

These are compatibility fixtures, not proof of present-day Facebook acceptance or
an account-safety guarantee. No delay setting guarantees avoidance of restrictions.
