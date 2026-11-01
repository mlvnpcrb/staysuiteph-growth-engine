# Reference Lead Radar workspace and profile handoff

This follows the owner-uploaded 2.11.30 Radar workspace hierarchy while retaining StaySuite branding. It connects the data service from `REFERENCE_BACKEND_CONTRACT_AUDIT.md`; it does not complete the scanner, AI, automatic replies, connections or all vendor states.

## Connected workflows

- Lead Radar now renders a real settings/inbox workspace instead of a planned placeholder. Its navigation availability is Partial.
- The collapsible settings area has Targeting, Automation, AI replies and Connections tabs, including keyboard arrow/Home/End navigation. Targeting saves exact/broad/negative phrases, owned selected groups, 15/30/60 minute cadence preferences and notification preferences. AI reply style/selling/directness/context can be saved without enabling AI.
- The inbox reads persisted records with author/post search, read/unread/starred and keyword filters, keyset Load more and authenticated CSV export. Leads support the reference stages, read/starred flags, private notes, canonical Facebook post links, deletion and Clear All through the displayed snapshot cutoff. Manual stages are labels, not proof a comment was sent.
- State and mutations are pinned to the validated StaySuite viewer and selected profile scope. Draft settings retain their initial revision until explicit save/reload; stale updates are rejected rather than silently overwriting another editor. Account changes hide old records and block old-scope writes immediately.
- Opening/reloading the workspace does not perform an extra redundant inbox refresh that could discard an open note editor. Note saves retain the revision captured when the editor opened, preserving concurrent-edit detection.
- CSV download requires a successful CSV response and complete body before creating a browser download. Failed exports do not report success.

## Extension 0.5.1

After Connect StaySuite and Facebook, the campaign workspace offers Open Lead Radar. The action rechecks the existing public Facebook actor probe and account-pinned StaySuite bridge before opening a profile-scoped Radar URL. Actor changes block opening. No new cookie reads or permissions are added; no live action is started. The URL carries a public profile scope and account hint, not credentials or an authorization token.

The web workspace derives ownership from validated server responses, rejects a mismatched account hint and remembers only the last selected public scope in per-viewer session storage. A selected scope is not presented as proof of an ongoing Facebook connection. Page-profile handoff is not yet supported by the existing personal-profile probe.

## Explicitly unavailable

Scanning, live notifications, AI qualification/generation, automatic comments and webhook delivery remain unavailable. Their settings/entry points are labelled or disabled; no synthetic leads are shown. A saved scan interval is a preference, not an active alarm. The current inbox can manage records received by the backend ingestion contract; the scanner is not connected.

Native unpacked Chrome loading remains blocked by administrator policy. The browser tests use fixtures and do not establish a live hosted session or Facebook compatibility. No new Facebook post/comment or real customer lead was created.

## Validation

Strict TypeScript, ESLint and production web/extension builds pass. The 356 unit tests and both script tests pass after updating the planned/partial navigation expectation. Browser checks cover saved settings/reload, lead stages/read/starred/notes, filtered CSV download, settings-tab keyboard navigation, connection/account mismatch, fresh actor handoff/refusal and light/dark accessibility. The full regression suite includes these new flows across desktop/tablet/mobile.

The full browser suite passed **216 tests** across desktop, tablet and mobile, including the Radar workflow in both themes and the fresh-profile handoff/refusal fixture. Unit/script checks passed **356 + 2**. These results validate fixtures and application contracts; they do not enable live scanning or establish native extension compatibility.
