# Reference frontend reconstruction

The owner confirmed on 2026-11-01 that the uploaded Group Posting PRO 2.11.30 ZIP is the frontend specification, retaining the StaySuite name. This pass rebuilds Compose and Templates using its layout hierarchy and late-cascade CSS values. It is an incremental reconstruction, not verified 100% visual or functional parity.

## Reference evidence

- `popup.html` lines 954–1010: five primary navigation entries and Templates/Activity subnavigation.
- `popup.html` lines 1616–1672: Templates action bar, search/list sidebar, selected-template preview.
- `popup.html` lines 1854–2050: posting identity, numbered audience/content steps, editor tools, media/card/link controls.
- `popup.html` lines 2127–2310: collapsed advanced settings, posting strategy, preview/schedule/post dock.
- The final matching rules in `popup.css` define the 46 px navigation frame, selected-tab underline, 26 px step number, 16 px step title, 13 px help text, 220 px editor, and attachment-strip controls. The original popup viewport is 780 px wide; StaySuite uses a centered 780 px maximum with responsive adaptations below 600 px.

## Implemented

The top navigation now uses the reference's compact frame, selected-tab underline, and original Font Awesome glyphs. The bundled WOFF2 file is reused unchanged (SHA-256 `2adefcbc041e7d18fcf2d417879dc5a09997aa64d675b7a3c4b6ce33da13f3fe`); its SIL OFL 1.1 notice is included. Font copyright was verified against the matching upstream v4.7.0 metadata. All groups, AI Group Finder, AI Studio, Safety and Settings are in the header tools menu. Unimplemented navigation entries retain accessible status descriptions rather than visual badge clutter.

Compose puts the posting-identity row and audience selector ahead of content. Group selection opens a modal with search, ordering, selection limits, rule-review information and removable selected-group chips. The composer uses the reference editor frame, text-tool bar and attachment strip. The saved-template control lists authenticated ready templates; replacement of an unsaved post requires confirmation. Reopening still verifies stored attachment bytes through the existing import path and does not grant publication approval. Link insertion accepts only HTTP(S) URLs without credentials and preserves the post-length bound.

Advanced Automation Settings is collapsed by default. Preview and Post Now open the existing guarded review workflow; Post Now is disabled while the current draft lacks valid inputs. No new publishing adapter is enabled. Campaign metadata remains available when editing saved Automations. Private-save and connection support remain available without dominating the Compose viewport.

Templates now has the reference Post Templates/Groups switcher, action bar, searchable list sidebar and selected-post preview. Name A–Z/Z–A sorting works. Existing create/edit/save/duplicate/delete/private-media/Compose-reuse behavior is retained, including account-change clearing and revision errors.

## Explicit gaps

Schedule, AI writing, post scoring, card design, profile-post import, starter packs, categories, and group collections are not implemented by this frontend pass. Their reference controls are disabled and explain their status. The full template editor toolbar/variations/media previews, all Compose source/preview states, rich content/backgrounds, progress rail/command center, scheduling/recurrence/automation flows, Lead Radar, agency/team/backup/localization and remaining inventoried screens still require implementation. The extension's own popup and workspace are not made identical by changes to the web dashboard.

This work does not establish exact pixel matching. The ZIP's HTML/CSS was inspected with vendor scripts disabled and vendor requests blocked. `/workspace/reports/exact-reference-compose/reference-static.png` is an unhydrated static inspection, not an installed extension screenshot; it includes inactive/uninitialized state and cannot serve as a complete visual acceptance baseline. Native unpacked extension loading remains unavailable under administrator policy. StaySuite screenshots show the actual built demo app, not a mock design or live user data.

## Verification

Shared validation, authenticated APIs, Supabase migrations/RLS and publishing gates are unchanged in this pass. The checks exercise real browser interactions for audience/content order, modal focus/Escape behavior, link validation, dirty-template replacement, split-library selection/sorting, approval invalidation and attachment reuse. Responsive and light/dark accessibility checks remain part of the suite. Final checks: ESLint and strict TypeScript pass; 282 unit tests and both script tests pass; web and Chrome MV3 production builds pass. A full browser run passed 192 checks and identified one missing accessible label in the three viewport variants of a new test. After fixing the label and final navigation/metadata polish, all 66 affected browser checks passed across desktop, tablet and mobile. No hosted Google login or live Facebook posting was verified. Native extension policy was not changed.
