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

Click the extension button to open its Facebook connection and saved library
directly. A full workspace is also available. Click Connect Facebook. Grant optional cookies
and www.facebook.com access. Only c_user and i_user identity values are read. A Page
acting session is refused in this version; switch to the personal profile first.
Connection starts a background-owned job. It probes the public actor in an existing loaded Facebook tab and reuses it only
when that actor matches the current browser identity. If none matches, it opens
a fresh inactive Facebook tab. Existing user tabs are never reloaded or navigated.
The popup/workspace may be closed while the background collector works.

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
stop/cancel and internal checkpoint commits. The UI has no checkpoint endpoint.
Collection runs directly in the background worker; startup does not depend on an
extension-tab handshake. The bounded job is under Chrome's five-minute operation
limit, and actual Chrome API activity occurs between page requests. There are no
artificial keep-awake calls. A worker/browser restart can interrupt the job; reopening
reports that state honestly and permits retry from the saved library.

Explicit session-cookie removal (without reading its value), account changes,
revoked permissions and closure of the owned Facebook tab invalidate collection.
Same-account cookie expiry refreshes do not create false account-change errors.
Cookie observers register when optional access becomes available. A visible popup
also checks current identity every two seconds, without fetching groups or returning
cached data, so missed cookie events cannot leave another account’s library shown.
Late responses
cannot commit after job invalidation.

The inactive Facebook tab closes after completion. Existing user tabs and any
Facebook tab the user activated are preserved on normal completion. Challenge or
denied-access tabs remain open for direct review. Clear local library affects only
the current extension account cache, never My Groups.

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
The native test also launches the real background collector and MAIN-world Chrome
injection against intercepted Facebook fixtures, closes the workspace mid-import,
reopens the saved library and switches accounts. Its test-only manifest clone models
permissions already granted; the shipped optional permissions remain unchanged.

Fixture results must be reported separately from live Facebook compatibility.
The agent has no connection to the user's authenticated browser. A live test in
that browser is required before calling this provider working with that account.
If collection fails, use Download diagnostics; never send cookies or request tokens.

## Live compatibility failure and diagnostic follow-up (0.2.1)

The owner's 0.2.0 report reached `group_connection` with HTTP 200, the initial
query, and `reviewed_fallback`; zero pages/groups were accepted. This establishes
that identity/bootstrap/request/JSON checks passed, but not which required
connection field was absent or invalid. It does not establish that the document ID
expired, that the account has no groups, or that Facebook denied access.

0.2.1 adds seven strict boolean presence/type checks (`data`, `viewer`, `groupsTab`,
`connection`, `edges`, `pageInfo`, `hasNextPage`) to downloaded diagnostics. No
response keys, values, messages, account IDs, group names or request tokens are
exported. Old diagnostic records remain valid. The UI no longer labels a failed,
empty initial import as a restored library. This is a diagnostic update, not a
verified fix for live collection. Query behavior and permissions are unchanged.

## Query loading compatibility changes (0.2.2)

0.2.0/0.2.1 tried synchronous `require(queryName + ".graphql")` only. When the
artifact was lazy, this selected the old package ID without asking Facebook's
loader for the current artifact. The live report confirms the fallback path was
used, but does not prove which missing response field caused rejection.

0.2.2 asks Facebook's own `Bootloader.loadModules` for the exact initial or
pagination query artifact when synchronous lookup fails. It accepts only numeric
IDs from read-only query artifacts with a matching operation name when present.
The loader has a 2.5-second bound; late callbacks cannot change the selected ID.
No arbitrary module names, asset URLs, vendor config servers or mutations are used.
Actor continuity and challenge checks run again after the asynchronous module load,
before any group request. The request includes `__comet_req=15`, matching the
reference's Comet request mode instead of omitting it.

Regression fixtures cover lazy current-ID selection for both pages, mutation and
wrong-name rejection, loader timeout, and an account change during module loading.
These are concrete compatibility changes, not a verified repair for the owner's
live Facebook response. Existing fallback IDs are still used if Facebook cannot
supply the current artifact. All response validation and stop conditions remain.
