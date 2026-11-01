# Strict Group Posting PRO reference scope

The owner's latest instruction supersedes the earlier coastal design and approximate feature mapping: if a customer-facing feature is absent from the uploaded ZIP, remove it. The target is 1:1 screens, feature names, controls, and behavior, not merely a similar workflow. The owner explicitly confirmed retaining the StaySuite name while matching the ZIP’s UI and features.

Reference: Group Posting PRO 2.11.30, 159 archive entries, SHA-256 `961a77059db7198e9610dd1a81c9a84556759c013bf4ac6305895533406a52e1`. Its primary navigation is observed directly in `popup.html`: **Compose, Templates, Automations, Lead Radar, Activity**. Activity has **Upcoming / History**. All groups, AI Group Finder, AI Studio, Safety, and Settings are reference tools, not invented StaySuite features.

## Strict cleanup implemented

- Removed the custom Overview component and dashboard, hospitality welcome/villa illustration, growth workflow cards, and standalone Analytics.
- Removed the coastal design-language route, Manrope assets, Stageshow onboarding component/runtime, and custom design-preview controls from this branch.
- Replaced the fixed marketing sidebar with the reference's top-navigation hierarchy, names, and order. Entry and successful authentication now land on Compose.
- Split the existing manual composer and saved-campaign library into Compose and Automations views. Existing campaign/private-media/backend functionality is retained.
- Added functional Upcoming / History partitions to Activity using existing campaign state, without inventing publication receipts.
- Renamed the group library to All groups. Removed hospitality category chips from both web and extension libraries, destination/accommodation/audience forms, custom marketing scores, evidence-coverage rankings, enquiries/bookings controls, and the manual accommodation-assessment screen.
- All groups now exposes group-name search and the reference's newest/oldest/name sort choices. Existing stored metadata is preserved; removing a UI feature is not a database deletion.
- Kept permission/rule review as a supporting requirement: the reference contains group rule/promotion evidence and explicit review (`group-shortlist-core.js`, `miloGroups_confirmRules`, and `gsbReasonRules`). Existing server-side eligibility checks are not weakened.
- Replaced the palette with values observed in `appearance.css`: light background `#f8f9fb`, surface `#ffffff`, text `#202936`, primary `#1871e8`; dark background `#202328`, surface `#2a2e34`, text `#f8fafc`, primary `#79acff`. Reused the bundled Inter/JetBrains font resources and font-face declarations for the reference typography.
- Retained old Overview/Campaigns/Posting Queue URLs only as redirects to their reference-named replacements, so saved bookmarks and extension links do not break.

## Parity is not complete

Matching the section names and deleting extra features does **not** make this a 100% reconstruction. Missing reference functionality is explicitly marked incomplete rather than being presented as working:

- Full Templates control parity and tags/collections. Basic persistent text/media CRUD and reuse were subsequently added; see `REFERENCE_BACKEND_RECREATION.md`.
- Full automation trigger/wait/loop editing, date scheduling, recurrence, and calendar projection.
- Full per-submission Activity history/filter/export. Search and CSV export of the loaded campaign summaries were subsequently added; see `REFERENCE_BACKEND_RECREATION.md`.
- AI Studio generation/rewriting, business memory, AI Group Finder and ranking.
- Lead Radar monitoring, intent scoring, lead capture/export, and reply workflows.
- Image-card designer, coaching/assistant/Autopilot, multilingual interface, cloud backup, agency/team tools, plan/trial/activation/referral flows, and other inventory items.
- Exact per-screen geometry, control placement, all component states, and live adapter behavior need further reference-by-reference implementation and verification.

The underlying authenticated Next.js/Supabase hosting and ownership controls remain infrastructure; they are not extra customer product modules. At the cleanup commit no data was deleted and no schema migration was applied; the subsequent backend recreation applies the additive Templates migration described in `REFERENCE_BACKEND_RECREATION.md`. No vendor backend was contacted and no live Facebook action was performed. The ZIP's scripts were inspected as data, not run as agent instructions. No vendor JavaScript was copied into the application.

This cleanup must not be reported as “100% similar” or “all features recreated.” The full audited inventory is in `GROUP_POSTING_FEATURE_PARITY.md`; its earlier approximate dispositions are superseded by this strict scope.

## Exhaustive source inventory

`reference/group-posting-pro-inventory.json` records every archive entry plus the popup's control IDs, English labels, localization keys, headings, and named external hosts. This is the concrete checklist for subsequent screen-by-screen parity work. It is generated by static parsing, not by running the uploaded extension. It includes controls hidden by account/plan/state and does not imply they are all simultaneously enabled.

## Validation of the cleanup

- Pinned pnpm frozen installation completed with lifecycle scripts disabled after the Supabase CLI binary download was blocked by the environment. No dependency versions or lockfile entries changed.
- ESLint and strict TypeScript: passed.
- Unit checks: 38 files, 255 tests passed; both Node script tests passed.
- Production builds: web and Chrome MV3 extension passed, including manifest verification.
- Full browser suite: 171 tests passed across desktop, tablet, and mobile. After the final Compose layout/label polish, the affected campaign, navigation, accessibility, and extension suites were rerun: 60 tests passed.
- Native unpacked-extension check: attempted and **blocked** by Chrome's administrator policy (`Extensions.loadUnpacked`). Browser policy was not changed; this is not counted as a pass.
- Browser checks use isolated fixtures. No real Facebook publication, hosted Google session, vendor AI/license backend, or end-to-end live parity was verified.

Screenshots of the actual built Compose interface and a packaged extension preview are saved as separate review artifacts. Passing these checks validates the cleanup and retained workflows, not 100% reference-feature completion.
