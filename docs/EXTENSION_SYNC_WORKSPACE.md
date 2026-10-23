# Sync workspace (0.1.0)

Open the extension → Open Sync workspace → Connect workspace. Grant optional
access to www.facebook.com and the configured StaySuite host. Open My Groups,
sign in, and reconnect if prompted. Allow the extension to save the collected
names and links, then click Sync groups. Keep the joined-groups Facebook tab
visible. The separate workspace survives popup dismissal and shows scan/save
progress and Stop sync. Reopening requires verifying the StaySuite session again;
there is no Facebook OAuth or verified Facebook identity connection.

This original experimental adapter reads visible link labels in the joined-groups
directory and scrolls it. It does not read group contents, cookies, tokens, private
API responses, or member details. No third-party extension code is included.
Results accumulate across virtualized viewports (up to 500, 160 passes or two
minutes) and are explicitly partial: reaching the loaded end cannot establish a
complete Facebook membership count. Layout changes, hidden tabs, visible modal
obstructions, challenges, restrictions and access denial stop collection.
Hidden dialogs and unrelated non-modal UI do not imply an account restriction.

Normal scan completion saves individual validated entries through the dashboard's
same-origin /api/groups endpoint, using the signed-in browser session. Server
getUser and RLS still authorize every request. x-staysuite-viewer binds writes to
the initially verified account and rejects session switches. This header is an
additional consistency check, never an authorization credential. Existing duplicate
entries, notes, rules and marketing evidence remain intact. Server errors and
ambiguous replies never count as confirmed saves. The dashboard listens for
staysuite:groups-synced to reload its library.

Cancel during scanning saves nothing from that scan; cancel during saving stops
after the in-flight request, retaining previously confirmed saves. Closing the
workspace stops further work, but an in-flight save can still complete. Retry is
idempotent. Names and links persist in the authenticated StaySuite database; no
new extension cache is written. The workspace displays only groups returned after
server identity verification. No new migration is required.

Build with PLASMO_PUBLIC_DASHBOARD_URL set to the exact updated Preview origin.
Do not pair this build with an older dashboard API lacking viewer_id. No production
deployment, automatic Facebook publishing, or account restriction bypass is added.

Verification: unit tests exercise virtualized batches, cancellation, denial,
identity mismatch and injected-request constraints. Browser fixtures exercise the
built CSP-protected workspace, permissions, consent, 12-group scan/save and library
filtering, plus collector dialog regression and light/dark accessibility. These
fixtures do not establish compatibility with a user's current Facebook account.
Native extension installation may be blocked by browser administrator policy.
