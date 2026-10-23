# Facebook account group library — experimental 0.2.0

The owner approved local identity-cookie reads and temporary Facebook page request
tokens on 2026-10-23 after reviewing the uploaded extension's collection mechanism.
The narrow exception is recorded in AGENTS.md. No publishing is added or authorized.

## Reference findings and independent implementation

The supplied Group Posting Pro 2.11.30 ZIP uses browser identity cookies, an automatic
connection import trigger, an extension worker, Facebook's internal paginated group
connection, and account-scoped local storage observed by its UI. Its first-connect
path suppresses DOM fallback. StaySuite 0.1.0's visible-link scrolling did not
reproduce that mechanism. This original implementation replaces that primary path.
Vendor source is not bundled. Two read-only document IDs are compatibility metadata
observed in the upload; a current Facebook query module is preferred when available.
No vendor config server, network rule, posting code or keep-awake script is used.

## Connect and collect

Open the extension workspace and click Connect Facebook. Grant optional cookies
and www.facebook.com access. Only c_user and i_user identity values are read. A Page
acting session is refused in this version; switch to the personal profile first.
Connection starts a background-owned job and a dedicated inactive collector tab.
It opens a fresh inactive Facebook joined-groups tab for current page context,
without reloading or navigating any existing Facebook tabs.
Leave Facebook and the collector tab open; the workspace and popup may be closed.

The collector invokes an original self-contained function in Facebook's MAIN world.
Known bootstrap modules provide current actor identity and page request/CSRF context.
Request tokens remain inside that function. Same-origin requests to Facebook use
browser-managed session credentials; the extension never reads credential-cookie
values. Only the normalized account name, group names/links and pagination metadata
return to the collector. Current actor and job ownership are revalidated before
and after each request and under the background checkpoint lock.

The first response is a compatibility probe: it must match the expected group-list
connection and page_info structure. Only a validated response permits pagination.
An unknown response stops with unsupported; there is no silent scrolling fallback.
This does not establish an officially supported Meta API or future compatibility.

Limits: 5,000 locally collected groups, 100 pages and a two-minute collection budget; a single request
has a 20-second timeout. Rate limits/challenges/denial stop immediately, with no
automatic retry. Repeated/missing cursors and partial failures cannot count as
complete. Pinned groups and regular groups are deduplicated by canonical ID URL.
A completed pagination traversal is evidence of that API response stream, not an
independent census of every possible account membership.

## Storage and lifecycle

Only strict validated account/library metadata is written to chrome.storage.local.
A library is keyed by the public Facebook account ID. Cache and newly observed
results may appear while fetching or after partial failure; UI labels completeness
and last completed time. A complete traversal replaces stale membership records.
Reopening checks the current identity and restores that account's list without
starting another import. Expired libraries are removed on access after 30 days;
this is access-time expiry, not a scheduled deletion guarantee.

Job bindings live in chrome.storage.session. Background operations serialize starts,
stop/cancel and checkpoint commits. Only the bound collector tab and run ID can
commit validated metadata. Session change events (including xs changes without
reading its value), account changes, revoked permissions and relevant tab closure
invalidate the job. Cookie observers are registered when optional access becomes
available. Stopping prevents late responses from being committed.

The collector and its inactive Facebook tab close after completion; existing user
tabs and any Facebook tab the user activated are preserved. A challenge/denied
Facebook tab stays open for direct user review. Browser restart/extension reload can
interrupt work; stale fetching states become partial/interrupted when reopened.
Clear local library affects the current extension account cache only, never My Groups.

## StaySuite synchronization

Facebook collection works independently of StaySuite login. Connect StaySuite to
verify its signed-in account, then save explicitly or enable automatic saving of
completed imports while the workspace is open. Each save verifies Facebook identity
and calls the existing same-origin groups API with the pinned StaySuite viewer ID.
Server getUser, origin checks and RLS remain authoritative. The existing app has a
500-saved-group capacity; a larger local library remains available even if cloud
saving reaches that limit. Duplicate handling
preserves existing notes, rule reviews and marketing evidence. A final GET updates
the app's library. Closing the workspace stops future cloud saves; an in-flight
save can still complete. Saved Facebook groups remain locally for a safe retry.

No Facebook cookies, CSRF context, raw response bodies or session headers are sent
to StaySuite. Diagnostics contain version, method, status/error codes, page/group
counts, completion, update time and whitelisted failure stage/HTTP status; they exclude names, account IDs, group links,
request tokens, cookies and network bodies.

## Verification and limits

Unit checks cover page aggregation, cursor failure, cancellation, account changes,
strict storage, sender ownership, cookie-read scope and session invalidation without
credential-value reads. Browser tests execute the page function with intercepted
responses, including bootstrap fallbacks and request-token return-boundary checks.
The native test also launches the real background/collector and MAIN-world Chrome
injection against intercepted Facebook fixtures, closes the workspace mid-import,
reopens the saved library and switches accounts. Its test-only manifest clone models
permissions already granted; the shipped optional permissions remain unchanged.

Fixture results must be reported separately from live Facebook compatibility.
The agent has no connection to the user's authenticated browser. A live test in
that browser is required before calling this provider working with that account.
If collection fails, use Download diagnostics; never send cookies or request tokens.
