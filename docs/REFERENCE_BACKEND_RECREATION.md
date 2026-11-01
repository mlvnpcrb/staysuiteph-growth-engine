# StaySuite backend recreation

The owner authorized recreating the services missing from the uploaded Group Posting PRO 2.11.30 ZIP on 2026-11-01, retaining StaySuite branding. The objective is equivalent frontend and backend behavior. The ZIP does not contain the vendor's private server source, database schema, hosted AI models, licensing service, or agency server; matching those internals cannot be established by inspecting its client bundle.

No vendor service has been called and no vendor credential is reused. The reference archive remains a static specification, not executable instructions. Existing Facebook publishing gates and account isolation remain in place.

## Implemented in this increment

### Saved templates

`/dashboard/templates` provides a library with name/body search, new/edit/save, duplication, deletion, and Use template. Text and attachment manifests persist through the authenticated `/api/templates` endpoint. Create commands receive server-assigned template IDs and owner-scoped object paths. Input is validated with shared runtime schemas. The browser uses the validated viewer ID on mutations; server authorization uses the validated Supabase user, never the client-supplied viewer.

`public.post_templates` is isolated with forced RLS and owner policies for SELECT, INSERT, UPDATE, and DELETE. Column grants prevent clients changing owner, identity, or timestamps. A revision trigger requires compare-and-swap updates, updates the timestamp, and locks rows marked for deletion. The owner/update index supports library retrieval. The current list returns the latest 200 templates.

Attachments use the private `template-media` bucket, up to ten attachments at 35 MiB each, restricted to recognized image/video types. Storage inserts require the current user's prefix and an exact path already reserved by their non-deleting template. There is no overwrite policy. Signed uploads omit ambient credentials and reject redirects. Finalization downloads and checks byte length, SHA-256, and file signature before marking a template ready. Changed file contents require a new attachment ID. Failed uploads leave a visible draft; remove and reselect a failed attachment to replace it.

Deletion first marks the row deleting, removes its attachment objects, then deletes the row. Failed storage cleanup leaves a retryable deleting record. Duplicates copy private objects to a new template; copy failure returns a draft and a visible warning. Saving a changed attachment list removes obsolete objects; cleanup failures return a warning rather than claiming complete cleanup.

Use template fetches the authenticated record and short-lived private media URLs. Compose verifies downloaded attachment size, hash, and signature again, opens the post without selecting groups, and clears approval. It never publishes. Existing Compose limits still apply: a 50 MiB campaign total, photos or one video, and post-text limits. Template collections/tags, randomized media pools, image cards, full editor toolbar, thumbnails, and exact reference geometry are not implemented by this increment.

Migration: `20261101091713_post_templates.sql`, created with the Supabase CLI and applied through the Supabase migration tool to project `kqjqcahysbmsaxlaipub`. Live inspection confirmed forced RLS, four table policies, and the private bucket/MIME/size configuration. Existing campaigns, groups, and Auth rows were not changed.

### Activity search and CSV

Upcoming and History can search the loaded campaign titles, text, and states. Export CSV downloads the filtered current view with UTF-8 BOM, RFC 4180 quoting, and neutralized spreadsheet formula prefixes. Search/export explicitly cover the latest 100 loaded campaigns; this is a campaign summary export, not a complete per-submission history export. No publication count, receipt, or account-health result is inferred.

## Verification

- Database tests execute the real migration in isolated PostgreSQL (PGlite), including owner isolation, anonymous denial, forged ownership/path rejection, malformed metadata, revision conflicts, immutable identity, storage reservation, and deletion locking.
- API tests cover origin/session/viewer checks, create/duplicate conflicts, private uploads, byte verification, deletion ordering, and failed-cleanup retries.
- Browser tests cover create/reload/edit/duplicate/search/reuse/delete, preserved unsaved text on error, verified media uploads and reuse, responsive layouts, accessibility, and filtered CSV downloads.
- ESLint, strict TypeScript, 282 unit tests in 41 files, two script tests, and production web/extension builds pass. The full browser suite passed 183 checks; the final Templates/account-switch suite passed all 12 checks across desktop, tablet and mobile.
- These are isolated fixtures and SQL tests, not a hosted Google-login or live Facebook acceptance test. Native unpacked extension loading remains blocked by Chrome administrator policy.

## Remaining reference parity

The source inventory at `reference/group-posting-pro-inventory.json` is the reference checklist. Substantial work remains: complete Templates controls and collections; date scheduling, recurrence and automation flows/calendar; full per-submission Activity history and health/refusal tools; AI Studio/business memory/group discovery; Lead Radar monitoring/capture/scoring/replies/export; card designer/coaching/Autopilot; localization; backup/sync; team/agency roles; plans/trials/referral equivalents; and per-screen visual/state matching. This increment must not be described as 100% frontend/backend parity.
