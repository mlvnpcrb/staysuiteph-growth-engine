# Reference library categories and group collections

This increment follows the owner-uploaded Group Posting PRO 2.11.30 client reference while retaining StaySuite branding. The archive is specification data; its scripts and private endpoints were not executed. This is additional partial reconstruction, not a claim of complete frontend/backend parity.

## Implemented

- Templates → Categories: Manage Categories dialog, 25-character names, add, rename and delete. Category deletion retains templates and increments affected template revisions.
- Template editor category assignment, category filtering, and category preservation on duplication. Opening an editor before the category catalog arrives preserves existing assignments rather than implicitly clearing them.
- Templates → Groups: named collections of saved groups, search, create, edit, duplicate, delete, split by group count and CSV export. Deleting a collection retains saved groups. Split retains the original and creates ordered parts atomically.
- Compose group selector expands a collection to a fixed selection of owned group IDs. It de-duplicates selections and refuses the whole addition when the 50-group audience cap would be exceeded or a referenced group is unavailable. Later collection edits do not silently change the draft audience. Audience changes invalidate approval.
- Account-pinned `/api/library` uses validated server sessions, same-origin mutations, strict input schemas, bounded payloads and private no-store responses. Owner checks and revision checks are enforced in SQL as well as the server route.

## Database

`20261101175938_library_collections.sql` creates `template_categories`, `group_collections`, `collection_groups` and `post_template_categories`, with forced RLS and owner-only SELECT. Clients cannot write these tables directly. Mutation functions use a private schema, explicit session ownership, owner serialization and compare-and-swap revisions. Composite foreign keys prevent cross-owner memberships and assignments. Limits: 100 categories, 200 collections, 1,000 groups per collection and 10,000 membership links per owner.

Created through the Supabase CLI migration command, tested locally against PostgreSQL/PGlite, then applied using Supabase MCP. Its filename matches the remote migration history version. Older migration history differences documented in `REFERENCE_SCHEDULING.md` remain unchanged; do not replay them blindly.

Live verification confirmed forced RLS on all four tables, no anonymous command execution and no authenticated direct collection INSERT. The security advisor found no new notices; the existing private validation-table notices, campaign definer warnings and disabled leaked-password protection remain unchanged. See [Supabase database linter](https://supabase.com/docs/guides/database/database-linter) and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Remaining differences

The collection editor links to All groups to add a new link; it does not yet reproduce inline link rows. Niche segmentation remains unavailable because the owner chose to leave AI unavailable. Profile-post imports, starter packs, full trigger/post/wait/loop automation editing, Lead Radar and vendor-specific service behavior remain outside this increment. Exact native extension screenshots and live publishing behavior have not been established; Chrome administrator policy still blocks unpacked native installation in this environment.

## Verification

- 333 unit tests across 48 files and 2 script tests passed.
- Typecheck, lint, web/extension build and manifest verification passed.
- 15 Templates/category/collection browser checks passed across desktop, tablet and mobile. Separate collection-audience/campaign checks cover atomic overflow refusal and selection de-duplication.
- Database tests cover ownership, denied direct writes/anonymous access, revision conflicts, assignment revisions, retained records, duplication and splitting. No live Facebook posts or real user test records were created.
