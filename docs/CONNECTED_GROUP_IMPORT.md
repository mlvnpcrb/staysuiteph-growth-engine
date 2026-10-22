# Connected Facebook Group Import

**Current workflow:** see [GROUP_IMPORT_UX.md](GROUP_IMPORT_UX.md). The import entry
point is now My Groups, context is optional, and a new prepared migration is
required for context-free saves. The instructions below record the earlier milestone.

Implemented 23 October 2026 (Asia/Manila). This milestone adds direct browser-to-
dashboard transfer to the existing group collector and authenticated saved-groups
API. It adds no automatic posting, Facebook Login integration, private API calls,
secret handling, database migration or authentication changes.

## Desktop Chrome acceptance test (local build)

These changes are committed locally only. The existing Vercel Preview has not
received the dashboard receiver; sending to that old deployment will not work.

1. Use your existing local Supabase configuration in `apps/web/.env.local` (see
   README/auth setup). Keep `STAYSUITE_DEMO_MODE=false` for a real save test and
   `SITE_URL=http://localhost:3000`. Start the dashboard with
   `pnpm --filter @staysuite/web dev`, and sign in with your existing account.
   Do not paste credentials into chat or commit your local environment file.
2. Build the extension with `pnpm --filter @staysuite/extension build`.
   `PLASMO_PUBLIC_DASHBOARD_URL` defaults to `http://localhost:3000`; it can be set
   in `apps/extension/.env.local` before building. Supported destinations are
   local HTTP (localhost/127.0.0.1) and HTTPS Vercel hosts. A different custom host
   requires updating the optional permission eligibility before rebuilding.
3. At `chrome://extensions`, enable Developer mode and Load unpacked →
   `apps/extension/build/chrome-mv3-prod`. Reload an older installed copy and
   reload its Facebook tab. The manifest version is now 0.0.2. No Chrome policy
   changes are needed or permitted in a managed testing environment.
4. Open `https://www.facebook.com/groups/joins/` in your normal logged-in browser.
   Click the extension, authorize reading visible names/links, then **Collect
   visible groups**. Verify names/links and uncheck a group you do not want.
5. Choose **Send N selected groups to StaySuite**. Allow Chrome's requested
   access to your configured StaySuite host. This is optional dashboard access,
   not a request for Facebook cookies, a password or an API key.
6. Group Finder opens/reuses a tab and shows **Groups received from your extension**.
   Reception is only a local preview, not a database save. Verify only the checked
   groups arrived. Enter destination/accommodation/audience, review, then choose
   **Save selected groups**. The names and URLs are saved in My Groups using the
   same authenticated API and RLS as manually saved records.
7. Verify individual **Imported successfully** / **Already in My Groups** badges
   and the aggregate counts. Open My Groups, reload, and confirm persistence.
   Send/save the same group again: it must be reported as already saved rather
   than creating another row.
8. Check permission denial and signed-out behavior. Denying dashboard access
   must not import data. A missing receiver/login page gives a not-ready error;
   sign in and send again. An unsigned dashboard cannot bypass API authorization.
   Interrupting network access during saving must preserve completed saves,
   mark the failed row and stop the batch. Retrying deduplicates prior saves.

The JSON export/import remains an optional fallback. No file copy is needed in
the direct connected flow. The popup's selection is temporary: send/export before
closing it. Scroll Facebook yourself and repeat to add more visible groups.

## Security and data flow

- `activeTab` and `scripting` remain the only installed permissions. There is no
  permanent Facebook/dashboard host grant, background worker, automatic content
  script, external messaging, storage permission or cookie permission.
- Optional eligibility is limited to `https://*.vercel.app/*`,
  `http://localhost/*`, `http://127.0.0.1/*`. On Send, only the configured host is
  requested. Chrome host permissions cover local ports, but the sender chooses
  and injects into the exact configured origin/port and Group Finder route.
  A site grant can be revoked through Chrome extension settings.
- Collection still only reads visible in-viewport group-root anchor labels and
  links inside the user's joined-groups directory. It does not scroll, fetch
  Facebook pages/APIs, read posts/messages/members, extract tokens or alter headers.
  Existing wrong-page/dialog/challenge guards stop collection. There are no
  automatic retries or bypasses. Unloaded or offscreen groups are not included;
  the result is not a complete joined-group list or proof of access/membership.
- The sender injects only into the chosen dashboard tab, in an isolated world.
  It waits for a ready receiver, sends a bounded schema-validated packet and
  correlates the acknowledgement by random transfer ID. It does not treat
  receipt as database success.
- The dashboard rejects foreign event origins/sources, malformed/oversized data,
  credentials, ownership fields, unsupported URLs, busy transfers and batches over
  100 unique groups. The transfer ID is correlation, not authentication. Same-page
  scripts can supply preview material; therefore all material remains untrusted,
  and receiving it never triggers a server write.
- Only explicit Save invokes same-origin `/api/groups`, whose existing server
  session validation and user-scoped RLS enforce ownership. No Supabase tokens,
  Facebook session data or privileged keys pass through the bridge.
- Duplicate URLs are normalized and merged before saving. The database's existing
  `(user_id, identity)` uniqueness handles duplicates against previously saved
  groups and races. Names alone do not establish that two different vanity/numeric
  URLs identify the same group; no network identity resolution is claimed.
- Per-row and aggregate save outcomes distinguish success, duplicates and failure.
  An error stops remaining writes; Stop saving takes effect after the in-flight
  request. Retry is safe through existing deduplication. Saving is limited to
  names/URLs plus the existing destination/accommodation/audience context, with
  blank evidence and `source=manual` (user-supplied), never verified rules.

## Validation limitations

Automated tests use synthetic Facebook pages, mocked Chrome APIs and local
PostgreSQL-compatible RLS tests already in the test suite. They cannot establish
current Facebook layout compatibility. Native unpacked installation/live Facebook
access is blocked here by Chrome administrator policy. Hosted persistence and
real Google session behavior are not claimed as tested for this new flow. No live
SQL, push, deployment, Production change or posting was performed.

## Recorded check results

- `pnpm install --frozen-lockfile`: PASS (existing ignored optional native build
  scripts are reported by pnpm; no dependency changes).
- `pnpm lint`: PASS.
- `pnpm typecheck`: PASS.
- `pnpm test`: PASS, 165 Vitest + 3 Node script tests (168 total).
- `pnpm build`: PASS, dashboard and Chrome MV3 builds plus manifest boundary check.
  Plasmo's optional registry version lookup reports an EAI_AGAIN proxy-related
  warning after compilation; the build command and verification exit successfully.
- `pnpm test:e2e`: PASS, 78 across desktop/tablet/mobile. Includes the compiled
  extension delivery function running in a CDP isolated-world dashboard harness,
  selection transfer, origin rejection, duplicate handling and partial-save retry.
  This is not an installed-extension or live Facebook claim.
- `pnpm test:extension`: BLOCKED, exit 2: `Extensions.loadUnpacked: Loading of
  unpacked extensions is disabled by the administrator.` No policy was changed.
- Live Facebook DOM compatibility and hosted import persistence: NOT VERIFIED;
  use the manual desktop acceptance test above. No additional live users required.
