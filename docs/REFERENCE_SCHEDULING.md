# Reference scheduling and recorded runs

This increment reconstructs the ZIP's simple scheduled-post workflow while retaining StaySuite branding. AI services remain unavailable at the owner's explicit request on 2026-11-01. It does not complete every reference feature or establish live Facebook compatibility.

## Customer workflow

Compose's Schedule action saves the exact current text, media, groups and settings privately, then opens Schedule Post. Edits made during saving prevent opening the scheduler against the earlier version. Automations provides the reference List / Calendar / Agenda choices, a Create New entry, schedule editing, pause and deletion. Existing saved campaign editing remains accessible.

The schedule editor supports once, daily, weekly and monthly recurrence, intervals, selected weekdays or month days, optional end time, and future-occurrence previews. Times are entered/displayed in Asia/Manila and persisted as UTC. Weekdays use Sunday=0; monthly dates absent from a month are skipped. The interval is anchored to the start date, rather than drifting with completion time. Saving or changing cadence pauses the schedule; enabling requires review of the current revision and an exact, already-approved campaign. Timing edits cannot silently reuse schedule approval.

Automations calendars distinguish future plans from recorded runs. Activity History shows scheduled runs and individual submission outcomes separately, including pending admin approval, refusals and uncertain outcomes. History and CSV exports do not infer publication from run completion. CSV cells are quoted and spreadsheet formula prefixes neutralized.

## Server behavior

`campaign_schedules` and `campaign_schedule_runs` have forced RLS and owner-only SELECT policies. Clients have no direct INSERT/UPDATE/DELETE grants. The public schedule RPC is an invoker wrapper around a checked function in the non-exposed `staysuite_schedule_private` schema. It validates the session, rejects anonymous users, derives ownership from `auth.uid()`, bounds payloads, and serializes owner-level scheduling changes. Revision checks reject stale and NULL revisions. Pure cadence functions expose no stored data.

A schedule captures the campaign's approved content/target/media/actor digest. Dispatch rechecks that digest, current group rule/permission evidence, campaign state and the existing validated publishing adapter. Scheduled campaigns cannot be started manually before a scheduled run is reserved. Future schedules do not reserve the actor-wide posting cooldown and block unrelated campaigns.

An owner advisory lock, row locks, one active run pointer and a unique schedule/time key prevent duplicate due-run records across tabs or restarts. Only one campaign per actor starts at a time. Existing campaign claims and leases enforce sequential publication and delays. No new adapter is enabled by the migration. Timed execution currently uses the validated Direct text/photo adapter; Classic scheduled execution and Direct video remain unsupported.

Run receipts are archived before resetting target state for another recurrence. Prior completed campaign receipts are retained when first reused. Deleting a schedule keeps its run history, and deleting a campaign is blocked until its current scheduled run has been resolved and archived. Failed starts roll back the run reservation and leave the schedule blocked. Paused or ambiguous submissions require explicit review; they are not automatically retried.

Runs more than 15 minutes late are recorded as missed and skipped. There is no burst catch-up after Chrome or the connection returns. This is an explicit StaySuite policy; matching all of the vendor's late-run/recovery semantics is not established by the client inventory. Existing rule/permission freshness requirements still apply to recurring schedules.

The implementation bounds schedules to 200 per owner, history reads to the latest 100 runs, calendar projection ranges to one year, and calendar rendering to 1,000 future occurrences. These limits are not a claim of matching vendor plan quotas.

## Extension 0.5.0

The updated MV3 extension adds the `alarms` permission for minute-level wakeups. It retains zero permanent host/content-script permissions and the existing optional site/tab grants. After connecting and validating Direct publishing, the owner explicitly arms background schedules for the current Facebook profile. Only enabled, reviewed schedules are eligible.

Stored connection metadata consists of the dashboard origin/tab, StaySuite viewer ID, public Facebook actor ID and a generation UUID. No session cookies, passwords, request tokens or API secrets are persisted. Wakeup verifies the exact StaySuite origin, permissions, viewer and current public Facebook identity. Errors or identity changes disarm checking and request reconnection/review. Disarming future wakeups does not cancel an in-flight submission; current campaigns have their own pause control.

The worker opens at most one scheduled campaign workspace and avoids duplicates. That workspace independently checks the enabled schedule/current run, account, actor and publisher before using the existing executor. A normally finished scheduled workspace closes; exceptions remain available for review. Chrome, a signed-in StaySuite dashboard tab and a usable Facebook tab must remain available. Closing only the popup does not remove an armed background wakeup.

Native loading remains blocked by this environment's administrator policy. Unit and browser fixtures verify the contracts and state transitions, not a live hosted Google session or Facebook publication. Native/live scheduling acceptance remains outstanding.

## Migration and verification

The CLI created the migration first; after MCP application its filename was aligned to the actual remote version: `20261101144558_campaign_schedules.sql`. It was applied to Supabase project `kqjqcahysbmsaxlaipub`. Live checks confirmed forced RLS on both tables, no anonymous RPC execution, no authenticated direct table writes or legacy-core execution, and the expected leap-day recurrence. Existing publisher configuration and Auth settings were not changed.

Security advisors before and after the migration returned the same findings: private validation tables deliberately have no client policies; existing owner-checked campaign RPCs are intentionally authenticated security-definer endpoints; leaked-password protection is disabled in the existing Auth configuration. No new scheduler finding was introduced. References: [RLS policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [privileged RPC review](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Earlier baseline migrations have pre-existing CLI/MCP version differences. This new file matches its applied remote version; do not blindly replay all baseline files with `db push`. The reviewed rollout uses the explicit migration tool.

Checks so far: frozen installation with lifecycle scripts disabled; 319 unit tests and both script tests; strict TypeScript and ESLint; production web/extension builds with manifest verification; all 204 browser checks across desktop, tablet and mobile. After final status-display polish, all 24 affected scheduler/extension browser checks and 23 focused SQL/background tests also pass. Live publishing was not exercised.

## Remaining parity

The full trigger/post/wait/loop flow builder, AI Wizard/week planning, Classic scheduled dispatch, full native scheduler lifecycle acceptance and exact per-state visual comparison remain unfinished. This increment must not be presented as a complete Group Posting PRO recreation.
