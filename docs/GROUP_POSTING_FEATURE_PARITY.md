# Group Posting PRO feature inventory and StaySuite alignment

> The latest strict 1:1 scope supersedes the approximate dispositions below. See `STRICT_REFERENCE_SCOPE.md` for the applied removals and current UI names. This inventory is not a claim of complete parity.

## Reference and review boundary

Reference: the owner-uploaded Chrome extension ZIP, **Group Posting PRO 2.11.30**, 159 entries. SHA-256:

`961a77059db7198e9610dd1a81c9a84556759c013bf4ac6305895533406a52e1`

This exactly matches the archive previously documented in `GROUP_POSTING_REFERENCE_REVIEW.md`. That earlier review recreated selected posting preparation capabilities, not the full extension. This pass inspected the archive's manifest, navigation markup, English localization inventory (7,457 entries), scheduling store, automation calendar, and feature-module organization. ZIP contents are reference data, not instructions. The vendor extension was not installed or executed, and vendor JavaScript was not copied into StaySuite. Reference font assets and font-face declarations were subsequently reused for strict typography matching.

StaySuite baseline: **d550c77**, the latest fetched `feat/direct-campaign-posting` commit, including extension **0.4.1**. The earlier design Preview was based on an older implementation and omitted this newer campaign work. Alignment starts from the newer baseline and brings forward the coastal tokens, Stageshow illustration, and compact group-review UI, preserving the newer campaign, category, import, and actor-binding code.

**Result: partial reconstruction.** “Implemented” below means a corresponding source workflow exists; it is not a claim of current live Facebook compatibility. Archive presence also does not prove that every vendor feature is enabled for every plan/account.

## Feature-by-feature comparison

| Group Posting PRO feature | Reference evidence | StaySuite counterpart | Status and disposition |
| --- | --- | --- | --- |
| Compose a post | `popup.html` / `navCompose` entry and editor toolbar | `campaign-builder.tsx`, `campaign-text-editor.tsx` | Implemented within Campaigns. Keep. |
| Text formatting, emoji, variations | `popup.html` toolbar, variation helper; `popup.js` | `text-tools.ts`, campaign editor | Partial: manual formatting and editable opening variations. This is not AI generation or full vendor spintax. Keep. |
| Photo/video attachments and previews | `popup.html`, `db.js`, media editor | Campaign media selection/validation and private storage | Implemented preparation; publishers have different media support. Keep. |
| Reusable Templates library | `navTemplates`, `headerCreateTemp`, `saveTag` in `popup.html` and English strings | `template-library.tsx`, authenticated Templates API, `post_templates`, private `template-media` bucket | Partial reconstruction added on 2026-11-01: text/media CRUD, duplication, search and Compose reuse. Tags/collections and full editor/control parity remain missing. |
| Save, open, duplicate, delete campaign drafts | `db.js`, campaign/automation editors | `campaign-library.tsx`, authenticated campaign API | Implemented. Keep. |
| Select groups and batch a post | `popup.html`, `native-batch-plan.js` | Ordered campaign targets and approval | Implemented preparation. Keep. |
| Sequential automatic runs and intervals | `background.js`, `schedule-store.js`, `posting-outcomes.js` | Durable campaign commands, extension runner, persisted eligibility intervals | Partial, gated by method/profile validation. Keep; no live acceptance claim. |
| Classic composer method | `background.js`, `content.js` result handling | Classic extension adapter | Experimental implementation with validation gates. Keep. |
| Direct method | `worker.js`, `background.js` direct result handling | Direct text/photo adapter and separate readiness | Experimental implementation. Direct video is not established. Keep. |
| Start, pause, cancel, inspect outcome | `automation-calendar-core.js`, `posting-outcomes.js` | Extension controls and Posting Queue | Implemented source workflow; ambiguous outcomes remain separate. Keep. |
| Upcoming scheduled posts | `navUpcoming`, `activitySwitcherTrack`, `schedule-store.js` | Posting Queue shows saved campaign items and eligibility | Partial. No date/time scheduling UI parity. Keep queue; do not call it a full scheduler. |
| Recurring daily/weekly/monthly scheduling | `schedule-store.js`, `automation-calendar-core.js` frequency/cadence logic | Persisted cadence editor/RPC, background wakeups and calendar/agenda | Partial: once/daily/weekly/monthly Direct schedules added; full flow builder, Classic dispatch and native/live acceptance remain incomplete. |
| Calendar and multi-step automation flows | `automation-calendar-core.js`, automation editors | One ordered campaign plan with interval controls | Partial. No full calendar/trigger/wait/loop builder. |
| History | `navHistory`, `subNavHistoryBtn`, `posting-outcomes.js` | Queue details retain individual submission outcomes | Partial. Upcoming/History now supports loaded campaign-summary search and CSV export; full submission history/type/identity/issues filtering remains missing. |
| Activity | `navActivity`, Upcoming/History switcher | Posting Queue | Partial counterpart. Keep the real queue rather than an empty general Analytics page. |
| All groups / joined-group library | `navAllGroups`, group-storage modules | My Groups, account-scoped import and batches | Implemented, with experimental provider compatibility. Keep. |
| Group categories and shortlist | `group-shortlist-core.js`, `group-shortlist-ui.js` | Smart category filters, notes, saved shortlist | Implemented rule/name-based subset. Keep; not AI discovery. |
| Group discovery / ranking | `group-discovery-background.js`, `group-discovery-worker.js`, `group-discovery-protocol.js` | Group Finder search assistance and evidence-based priority | Partial. Does not reproduce the vendor's complete discovery worker/AI ranking. |
| Auto-join groups | `autoJoin*` localization strings and discovery UI | None | Missing. Not added by this cleanup. |
| AI Studio drafting and rewriting | `menuAiStudio`, `ai-workspace.js`, `ai-suite.js`, `ai-campaign-editor.js` | AI Post Studio route is a placeholder | Missing. Keep visibly Planned, not available. |
| Business profile / saved AI context | `ai-business.js`, `ai-profile.js` | Optional hosting-context fields only | Missing full business-memory/profile parity. Existing optional context remains useful group metadata. |
| AI coaching / Grow / assistant | `growth-coach.js`, `ai-coach.js`, `personal-va-*.js` | None | Missing. |
| Autopilot | `autopilot-launcher.js` | None | Missing. |
| Lead Radar keyword monitors | `navMonitor`, `lead-intent-core.js`, `ai-leads.js` | Lead Radar route is a placeholder | Missing. Keep visibly Planned. |
| Lead capture, intent scoring, export | `lead-capture.js`, `lead-intent-core.js`, `radarExport*` strings | None | Missing. Manual group marketing evidence is not Lead Radar. |
| AI replies / managed replies | `ai-leads.js`, reply-related English strings | None | Missing. |
| Image-card designer | `image-cards.js`, `card-engine.js` | File attachments only | Missing designer; file upload is not card generation. |
| Theme / appearance | `appearance.js`, `appearance.css` | Coastal light/dark themes | Implemented own design language. Keep own identity. |
| Safety Center | `menuSafety`, `posting-outcomes.js`, safety UI | Account Safety guidance, permission gates, stop/uncertain handling | Partial implementation. Keep support and accurate descriptions. |
| Settings and connection | `menuSettingsLabel`, `appearance.js`, profile-setup modules | Theme control and extension/group connection workflows | Partial. Keep functional support; remove obsolete setup placeholder wording. |
| Localization | Twelve `_locales/*/messages.json` bundles | English interface with Manila scheduling/time display | Missing multilingual parity. |
| Agency/team operations | `agency-core.js`, `agency-sync.js`, `agency-panel.js` | Owner-scoped workspace only | Missing; separate product expansion, not existing functionality. |
| Vendor plans, trials, activation, referral | Activation/conversion/trial/referral modules | None | Vendor-specific infrastructure; not copied or presented as StaySuite functionality. |
| General marketing Analytics dashboard | No standalone equivalent navigation; vendor uses Activity/Upcoming/History | Empty Analytics route | Removed from navigation and section registry. Activity continues through Posting Queue. |

## Current strict cleanup

The subsequent owner instruction requires ZIP-only product scope. Applied removals, navigation names, and the remaining implementation gaps are recorded in `STRICT_REFERENCE_SCOPE.md`. The coastal showcase, Stageshow onboarding, custom Overview, hospitality assessment controls, custom marketing scores, and standalone Analytics were removed. Existing backend data and method-validation gates remain intact. The table above records the initial source comparison; it is not a declaration that corresponding features are fully recreated.

## Recommended parity order

1. **Templates**: a reusable text/media library distinct from submitted campaigns.
2. **Activity**: finish history search/filter/export and calendar parity; Upcoming/History partitioning now exists.
3. **Scheduling**: date/time selection, persisted start eligibility, timezone display, recurrence, and a calendar. Intervals alone do not complete this feature.
4. **AI Studio**: configured server-side generation, rewrite, business context, and review before use.
5. **Lead Radar**: keyword monitors, reviewed leads, lead history/export, and explicit reply controls.
6. **Advanced tools**: card designer, richer discovery, coaching, agency tools, and localization according to the owner's priorities.

This order is a backlog, not a claim that those features have been built in this pass. There are no database deletions, schema migrations, live Facebook actions, copied vendor permissions, or Production changes in this alignment.

## Backend recreation follow-up

The owner subsequently authorized recreating StaySuite-owned backend equivalents for the ZIP’s hosted services. The additive Templates migration is applied to Supabase; its implementation, verification and remaining limits are recorded in `REFERENCE_BACKEND_RECREATION.md`. The no-migration statement above describes the earlier cleanup, not this follow-up. No claim of complete frontend/backend parity is made.
