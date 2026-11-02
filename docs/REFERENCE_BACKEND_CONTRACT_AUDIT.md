# Backend contract audit against the uploaded ZIP

> Automation follow-up: `REFERENCE_AUTOMATION_FLOWS.md` adds Trigger/Post/Wait/Loop/Stop execution, immutable template-post compilation, an editor and extension handoff. Exact layout and several advanced Post modes remain incomplete.

> Follow-up: `REFERENCE_RADAR_WORKSPACE.md` connects the Radar settings/inbox UI and extension profile handoff. Scanner, AI, replies and connections remain unavailable. The backend checkpoint details below retain their original scope.

This is a source-based behavioral reconstruction checklist, not a claim that StaySuite contains the vendor's private server source or has reached 100% parity. The owner authorized recreating the backend while retaining StaySuite branding. AI remains unavailable by explicit owner choice.

The uploaded Group Posting PRO 2.11.30 ZIP has SHA-256 `961a77059db7198e9610dd1a81c9a84556759c013bf4ac6305895533406a52e1`. Rechecking the extracted files against the archive found no byte differences. ZIP content was inspected as data; no vendor scripts were run, no vendor credentials reused and no vendor endpoints called.

`docs/reference/group-posting-pro-backend-contracts.json` records hashes, external host names, candidate storage-key literals and network/message call-site counts for 100 JavaScript/HTML/JSON source/data files. It excludes credentials and URL query values. Reproduce with:

```
node scripts/inspect-reference-backend.mjs /path/to/extracted-reference docs/reference/group-posting-pro-backend-contracts.json
```

Lexical counts and candidate keys are evidence pointers, not an inferred complete API schema. The earlier full archive/control inventory remains `docs/reference/group-posting-pro-inventory.json`.

## Where the reference backend behavior actually lives

The extension implements considerable data and execution behavior locally through Chrome storage, locks, background workers, alarms and runtime messaging. A server-only clone cannot reproduce that behavior. StaySuite uses authenticated Next.js APIs/Supabase for shared durable data and its extension for Facebook-tab interactions. The archive does not reveal the private implementations behind AI, licensing, team/agency hosting or other remote services.

| Contract family | ZIP evidence | StaySuite state |
| --- | --- | --- |
| Templates and private media | `popup.html`, `db.js`, `schedule-store.js` | Private CRUD, media verification, duplication and reuse implemented; remaining media/editor controls incomplete. |
| Categories and group collections | `categoryManagementModal`, group collection editor in `popup.html` | Owned categories/assignments and collection CRUD/split/export implemented. Inline collection link rows remain incomplete. |
| Ordered campaigns and publishing | `popup.js`, background workers and posting outcome modules | Owner-bound queues, exact approval, actor validation, claims, delays and outcome records implemented. Native/live acceptance incomplete. |
| Date/recurrence scheduling | `schedule-store.js`, `automation-calendar-core.js` | Persistent cadence, due-run reservation, minute wakeups and archived receipts implemented. Full trigger/post/wait/loop builder incomplete. |
| Radar settings, matching and inbox | `radar-core.js`, `radar-background.js`, `radar-workspace.js` | Settings/inbox API and durable data service added in this increment; UI/collector integration remains incomplete. |
| Radar scan and seen history | `gppRadarSettings:v2:`, `gppRadarHistory:v2:`, `gppRadarSeen:v2:` literals | Server-side idempotent ingestion/tombstones implemented. No scanner is enabled; submitted data is not proof of a verified Facebook scan. |
| Radar lead stages | `radar-workspace.js`: new/replied/conversation/customer/closed | Same stage values, manual read/starred/note changes and revision checking implemented in backend. A manual stage is not a publication receipt. |
| Radar AI, auto-comments and connections | `ai-leads.js`, `lead-intent-*`, `radar-automation.js`, `radar-background.js` | AI unavailable by owner choice; automatic replies/webhooks remain unavailable. |
| Activity | `posting-outcomes.js`, Activity/History popup controls | Campaign summaries, scheduled receipts and CSV implemented; complete history/filter/export parity remains incomplete. |
| Group import/discovery/join | Group provider/discovery modules | Account-scoped import exists with experimental provider gates. Full discovery/auto-join parity incomplete. |
| Profile post import, starter packs, cards | Template/profile-import controls and image/AI modules | Incomplete. |
| Backup/cloud sync/localization/team/plans | Storage, locale, agency and activation modules | Incomplete. No vendor entitlement is fabricated. |

## Lead Radar data service

`GET /api/radar?scope=personal:12345` returns owner/profile-scoped settings and up to 100 leads, with a keyset cursor. Filters cover author/post text, unread/read/starred, keyword and stage. Cursor ordering is discovery time descending, then UUID descending. Responses are private/no-store and state capabilities explicitly: scanning, AI, auto-reply and webhooks are false.

`GET /api/radar/export` streams the filtered inbox as CSV across keyset pages, with UTF-8 BOM, quoted fields and spreadsheet-formula neutralization. A discovery-time cutoff excludes newer arrivals; read/stage/note changes during export can still affect later pages, so the response declares live consistency rather than promising a frozen snapshot. Any page failure interrupts the download. The existing profile cap bounds exports to 2,000 rows.

`POST /api/radar` accepts strict commands: `save_settings`, `ingest`, `update_lead`, `delete_lead`, and `clear`. Validated server sessions determine ownership. An optional `x-staysuite-viewer` header pins the active account; it does not authorize access. Mutations require a same-origin request. Profile scope is an owned namespace, not proof that Facebook authenticated that actor. This endpoint cannot publish or reply.

Settings preserve separate exact, broad and negative rules, the reference 15/30/60 minute interval values, notification preferences and reply style/selling/directness/context. Up to 250 owned groups are accepted, matching the core normalizer; the reference popup recommends a smaller selection. Saving settings alone never starts scanning.

Ingestion accepts submitted post content and an owned selected group. It rechecks the settings revision and derives matches, group name and canonical Facebook post URL on the server. Clients cannot forge qualification, matched keyword arrays, owner IDs or publication receipts. Exact phrases use word boundaries, broad terms require every token, negative phrases exclude a result, and typographic punctuation/NFKC are normalized. Additional Unicode 17 letter/mark/number ranges replace PostgreSQL's incomplete locale-based boundary approximation. Tests compare both matchers across representative Latin/CJK/non-Latin/combining-mark and number cases; this is not a claim of exhaustive equivalence for every locale-specific case mapping.

Duplicate post/group/profile identities retain their prior inbox state. Deleted entries are hidden by RLS, their author/text/note/keyword data cleared, and a tombstone prevents reappearing on another submitted scan. Tombstones older than 90 days are purged during the owner's next Radar mutation. Clear uses a timestamp cutoff to avoid erasing newly arriving records after the displayed snapshot. Limits are 50 profile settings per owner, 2,000 inbox/tombstone records per profile and 10,000 per owner; these are explicit StaySuite bounds, not verified vendor plan quotas.

Both tables have forced owner RLS and client SELECT only. Checked mutations run in a non-exposed private schema behind an authenticated invoker wrapper. Owner locks and row revisions serialize changes. Anonymous RPC access and direct client writes are denied. No live Facebook content or real lead records were created during verification.

Migrations `20261101185113_lead_radar.sql` and `20261101185416_radar_unicode_matching.sql` were created through the CLI, locally tested and applied through MCP; filenames match the remote migration history. Existing older migration history differences remain documented in `REFERENCE_SCHEDULING.md`.

The existing security advisor findings remain outside this increment: deliberately inaccessible private validation tables, existing owner-checked campaign definer functions and disabled leaked-password protection. No new Radar security finding was introduced. References: [Supabase database linter](https://supabase.com/docs/guides/database/database-linter) and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Completion boundary

This increment adds a real backend service, but Lead Radar is not yet usable as a complete reference workflow: its frontend, active-profile bridge, scanner, qualification and replies are not connected. The public navigation continues to label it unimplemented. Full automation editing and the other incomplete rows above still require implementation. Chrome administrator policy continues to block native unpacked-extension acceptance in this environment. Nothing here should be reported as 100% similarity.

## Verified results for this increment

- Revalidated all 158 archive files against the extracted reference: zero mismatches (159 ZIP entries include a directory).
- 356 unit tests across 52 files and both script tests passed; the focused Radar tests cover SQL/RLS, authentication, profile scopes, Unicode boundaries, dedupe, revision conflicts, tombstones, cursor/filter binding and interrupted CSV downloads.
- Strict TypeScript, ESLint, production web/extension build and manifest verification passed.
- The full browser regression suite passed all 210 tests across desktop, tablet and mobile. The new backend CSV route additionally has dedicated unit tests and production-build validation; there is no claim of a completed Radar UI browser workflow.
- Live read-only checks confirmed both new tables have forced RLS, anonymous command execution is denied, direct authenticated INSERT is denied, and the punctuation/broad/combining-mark examples match expectations.
- No new security-advisor finding appeared after the Radar schema rollout. No live Facebook action, vendor API call or real customer test record was created.
