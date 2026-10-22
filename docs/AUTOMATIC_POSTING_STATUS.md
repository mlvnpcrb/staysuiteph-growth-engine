# Connected groups and automatic posting: current status

23 October 2026 (Asia/Manila).

The user requested a PilotPoster-like experience and explicitly selected one
campaign approval followed by automatic sequential posting with intervals. This
updates the desired product scope from per-group final publishing confirmation.
It does not authorize restriction evasion, unsupported claims of safe frequency,
credential collection, Production changes or untested live posting.

## What is established

Static analysis of the uploaded PilotPoster version 1.3 package shows paginated
internal Facebook GraphQL group queries, page CSRF-token extraction, request
Origin modification, publishing mutations, and vendor WebSocket coordination.
This is not a supported Facebook Login permission that lists all joined groups.
The package was not executed; its request IDs and response assumptions have not
been validated against current Facebook behavior. No vendor code was copied into
StaySuite. A CSRF token is not an OAuth access token; they must not be conflated.

The current StaySuite collector remains a visible-link collector. It does not yet
implement connected group synchronization or automatic publishing. Its generic
Chrome failure message has now been replaced with privacy-preserving categories:
permission denied, unsupported browser tab, tab unavailable, extension reloaded,
and unknown collection failure. Raw exception URLs/query strings are not exposed.
A Chrome failure does not establish a Facebook account restriction.

## Intervals

No ban-proof interval has been established. A user-selected interval is a pacing
setting, not a safety guarantee. Group rules may require hours/days between
promotions or prohibit them altogether. Before a job is eligible, the campaign
must have current group-specific permission/rule evidence and the exact approved
content/target version. Missing evidence blocks posting. Queue eligibility must
respect the later of configured campaign pacing and applicable verified group
constraints, persisted across restarts. It must never be advertised as avoiding
Facebook detection, and must not use account rotation or challenge bypass.

A warning, rate limit, challenge, permission denial or ambiguous publication
result must stop the affected campaign. A possibly successful post must not be
retried automatically; it needs reconciliation to avoid duplicate posts. A
successful mutation response alone must not be relabeled as guaranteed public
visibility or admin approval.

Official-source research attempted:
- https://transparency.meta.com/policies/community-standards/spam/
- https://www.facebook.com/legal/automated_data_collection_terms

Both requests were blocked by the execution environment proxy (CONNECT 403).
Current policy text was therefore not retrieved or represented as verified.
There is no evidence here supporting a numeric “safe” interval recommendation.

## Concrete blocker

The managed browser rejects native extension installation:
`Extensions.loadUnpacked: Loading of unpacked extensions is disabled by the administrator.`
There is no connected user-browser tool or Facebook test session in this runtime.
Consequently, real joined-group pagination, internal-endpoint compatibility,
posting confirmations, group permission handling and account warnings cannot be
verified here. Mock responses cannot establish those properties. The local policy
must not be bypassed.

The next requirement for a live integration is a permitted desktop Chrome testing
session, operated by the account owner or through an explicitly connected browser,
with an agreed test group and a single explicitly approved test draft. Do not
share Facebook cookies, passwords or access tokens. Read-only group retrieval
must be demonstrated before enabling a publishing test. Until that evidence
exists, automatic posting is NOT IMPLEMENTED/NOT READY and no ban-safe interval
is claimed. The existing supported-access and stop-on-restriction requirements
remain in effect; user authorization to automate does not establish API support.
