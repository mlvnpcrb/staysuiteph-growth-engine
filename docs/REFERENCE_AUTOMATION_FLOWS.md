# Reference automation flows and template posts

This checkpoint reconstructs another part of Group Posting PRO 2.11.30 using StaySuite-owned services. It does not contain the vendor's private server source and is not 100% frontend/backend parity. Keep StaySuite branding. AI remains unavailable by the owner's choice.

## Reference evidence and behavior

The uploaded ZIP's `popup.js` flow serializer (`o_`) and background interpreter expose ordered Trigger, Post, Wait, Loop and Stop blocks. Post blocks refer to saved templates. Wait serializes to positive total minutes. A backward Loop must include a Wait; counted loops use total passes, so two means two visits. Stop ends the automation even when its Trigger recurs. The reference includes additional Post settings and group-selection modes that are still outside this implementation.

The archive hashes and inspection boundaries remain documented in `REFERENCE_BACKEND_CONTRACT_AUDIT.md`. Reference scripts were inspected as data, not executed or connected to vendor services.

## Implemented workflow

Automations now includes a flow list/editor with stable step identities, keyboard-accessible reordering, immediate/once/daily/weekly/monthly Triggers, Post blocks, positive-minute Waits, counted/forever backward Loops, and Stop. Trigger dates display in Asia/Manila and persist as UTC. The existing schedule editor remains available. Internal flow child schedules are hidden from that editor; the extension still receives them for dispatch checks.

Post blocks can select saved posts or compile selected ready templates against explicit owned groups. Template compilation preserves exact text, attachment order and hashes, group order, Facebook identity and pacing settings. Prepared posts reference existing private `template-media` blobs, not copies. Their reserved campaign paths never authorize removal of the template originals. Editing an immutable prepared post requires preparing a new version.

Saving creates a paused flow. Review reloads the current saved definition/digest and each exact post, displaying its text, groups, identity, pacing settings and attachments. A graph changed in another tab is refused rather than approved under old displayed steps. Enabling requires explicit review, matching identity across posts, fresh group permissions and the existing verified Direct publisher. The review confirmation is cleared after changes or a failed enable. Unsaved edits require discard confirmation; an account change clears the prior editor.

Extension 0.5.3 adds an Automations handoff beside Lead Radar. It reads the current public Facebook actor again, compares it with the connection and rechecks the StaySuite viewer before opening the account-pinned URL. The editor prefills the public identity only from a matching viewer handoff. URL scope is not proof of Facebook authentication. No new cookies, permissions or publishing adapter were added. This extension version also preserves leading/trailing post whitespace through the shared plan parser; use 0.5.3+ for exact template content.

Arm background schedule checks in the connected extension. Its existing minute alarm calls the same owner/actor-checked schedule tick, which now advances flows. Each Post uses one internal once schedule and the existing sequential publisher. Actual run records and receipts control advancement; an old completed campaign is never treated as a new completed occurrence. `post_started` means queued and is displayed as **Post queued**, not published. A completed run can include `pending_admin` receipts.

Wait deadlines persist across pause/resume. Missed starts older than 15 minutes are skipped or blocked rather than dispatched in a catch-up burst. Failed, uncertain, refused and unresolved submissions stop for explicit review; they are never automatically retried. Stop terminates recurrence. Deleting a flow keeps its saved posts, events and archived receipts. Structural changes/deletion are blocked while a submission is unresolved.

## Backend contracts and access

- `GET /api/automation-flows`: owned flow list; optional `id` for current approval digest, or `history=true` for the latest 20 owned events.
- `POST /api/automation-flows`: strict `create`, `save`, `enable`, `pause`, `delete` commands with compare-and-swap revisions. Enable binds the exact current digest and requires `reviewed: true`.
- `POST /api/automation-flows/prepare`: strict template ID/revision, idempotency request ID, explicit owned group IDs, public actor identity and pacing settings. A matching retry returns its existing job; different content under that request ID conflicts.

API routes validate server sessions and reject anonymous sign-ins. Mutations require same origin; `x-staysuite-viewer` pins the current account. Owner IDs, media paths and frozen manifests are derived on the server. Responses are private/no-store and database errors are redacted.

Four new tables have forced owner RLS and authenticated SELECT only: `automation_flows`, `automation_flow_posts`, `automation_flow_events`, `automation_prepared_posts`. Checked mutations live in a non-exposed private schema behind public invoker wrappers. Legacy campaign/schedule cores cannot be called directly. Gateways preserve prior execution checks and add flow-position and template-source checks. Per-owner locks serialize scheduling, and enabling all posts is one transaction: a later media failure rolls back earlier approvals.

Current template revision/state/content and source references contribute to prepared-post approval hashes. Template edits/deletion invalidate approval; absent or mismatched storage metadata rejects preparation and dispatch. The extension verifies downloaded bytes against the saved manifest. Existing ordinary campaign approval hashes remain byte-for-byte unchanged, verified for text and attachment cases.

Migrations were created through the Supabase CLI and applied through MCP. Local filenames match actual remote migration history:

- `20261102030310_automation_flows.sql`
- `20261102030322_automation_template_posts.sql`
- `20261102031159_automation_template_text_limit.sql`

The first application confirmation expired without applying changes; a read-only check confirmed no table/history entry before the successful retry. No real customer fixture or Facebook post was created. Live read-only checks confirmed forced RLS, denied client INSERT/anonymous RPC execution, invoker public wrappers and denied legacy-core execution. The two prior public security-definer warnings are resolved. Remaining advisor findings are the four intentionally inaccessible private validation tables and the existing disabled leaked-password protection setting.

## Current limits and remaining parity

StaySuite bounds flows to 50 per owner, 30 steps and 50 distinct saved posts per graph; Post blocks accept up to 10 jobs and each job up to 50 owned groups. The existing 20-active-campaign capacity still applies when preparing new jobs. Events retain the latest 5,000 per owner. These are explicit implementation bounds, not verified vendor plan limits.

The current publisher requires nonempty text up to 10,000 UTF-16 code units, matching the editor and extension. A corrective migration rejects excess whitespace and astral-Unicode length overflow before storing a job; live read-only checks confirm 5,000 emoji occupy 10,000 units and 5,001 exceed the limit. Media-only/longer templates, automatic video publication and Classic flow execution remain unavailable; content is never silently truncated or replaced. Template selectors mark unsupported versions unavailable.

Still incomplete: the original popup's exact flow layout/drag interactions, per-block inherited settings, alternate/rotate order, dynamic/random groups and collections, native multi-group/periodic Classic, first-comment/link controls, AI variations, complete calendar/history projection for multi-step flows, and other backend families listed in the audit. Flow authoring is functional but is not a pixel-identical popup reproduction. Licensing/team/cloud/localization and external service behavior cannot be inferred as complete from an extension ZIP.

Native unpacked Chrome installation remains blocked by administrator policy. Automated browser fixtures and SQL tests do not establish current live Facebook compatibility or a successful Google login on a protected deployment. No production merge/promotion is included.

## Verification

397 unit tests across 55 files, both script tests and all 237 browser tests across desktop/tablet/mobile passed. The browser tests include both-theme accessibility checks, template compilation, persistence, exact review, stale-resource/graph rejection, discard protection and account-pinned handoffs. Strict TypeScript, ESLint, production web/extension builds and manifest verification passed.

Build provenance, screenshots, extension package hash and preview status are recorded in `/workspace/reports/staysuite-automation-flows`. The report distinguishes fixture tests, live read-only database checks and the unverified native/live publishing path.
