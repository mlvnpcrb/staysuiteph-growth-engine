# Free joined-group collection

This Phase 2 flow replaces the unfinished paid-search work. No Brave API key,
OpenAI key, search subscription, or new migration is required.

## Use it

1. Build the extension (`pnpm --filter @staysuite/extension build`). Configure
   `apps/extension/.env.local` with `PLASMO_PUBLIC_DASHBOARD_URL` set to your
   working Preview origin before building. This origin is public configuration,
   not a credential. Rebuild after changing it.
2. In desktop Chrome, open `chrome://extensions`, enable Developer mode, and
   **Load unpacked** → `apps/extension/build/chrome-mv3-prod`. Reload the extension
   after replacing its build. An unpacked extension is not installed by Vercel.
3. In your normal logged-in Facebook tab, open
   <https://www.facebook.com/groups/joins/> (Your Groups). Open the extension,
   authorize reading visible names and links, and click **Collect visible groups**.
4. Review/uncheck the preview, then export `staysuite-groups.json`. Export before
   closing the popup: nothing is retained in browser storage. Scroll the directory
   yourself and repeat to collect another batch; collection does not auto-scroll.
5. Open Group Finder on your dashboard, enter destination/accommodation/audience,
   and use **Import StaySuite group collection**. Each imported group is assessed
   using the existing transparent rule-based engine, then ranked by text relevance.
   This is not a generative-AI or Facebook activity analysis.
6. Review/select and **Save selected groups**. Saving is sequential and cancellable
   between requests; an already-started write may finish. Errors stop the batch.
   Retrying is safe because the existing per-user identity constraint deduplicates
   saves. Filtering does not change which checked groups will be saved.

Multiple exports merge locally by canonical group URL (maximum 100 unique groups,
100 KB per file). Oversized/invalid imports are rejected without replacing the
current list. Save/clear the current batch before importing more than 100 groups.
Closing/navigating away clears the local import preview, not already-saved data.
Keep the export until the data is saved. Delete export files yourself when no
longer needed; joined-group names may reveal your interests.

## Permissions and trust boundary

- MV3 permissions: `activeTab` and `scripting`, invoked only by the popup button.
  No persistent host permissions, background worker, automatic content scripts,
  external messages, storage, cookies, downloads or clipboard permission.
- Code runs in the isolated world, in the main frame only, and fails outside HTTPS
  facebook.com/www.facebook.com/m.facebook.com `/groups/joins/` or
  `/groups/your_groups/`. It reads only visible, in-viewport group-root anchor labels
  and URLs within `main`/`role=main`. Hidden/offscreen links, post links, navigation
  directories and foreign URLs are excluded. Collection is capped at 100 results
  and 3,000 inspected links per click. Tracking queries/fragments are removed.
- Visible dialogs, recognized challenge titles and checkpoint/CAPTCHA elements
  block collection. There are no retries, hidden network calls, clicks, automatic
  scrolling, posting, member-list reads, private-group page reads or token access.
- The popup sends nothing to StaySuite. The JSON export is a local download. The
  dashboard validates it as untrusted input and ignores any claimed identity:
  extra fields (including credentials/ownership) are rejected. Only name and URL
  enter the existing authenticated `/api/groups` POST after explicit Save.
- Saved records remain `source=manual` (user-supplied). Collection timestamps are
  informational only and not persisted as proof. Membership, group activity,
  privacy, posting eligibility and rules are **not verified**. Review rules in
  Facebook before any future outreach. Names alone give weak relevance evidence.
- Auth, profiles, existing RLS, grants, APIs and migrations are unchanged. Saving
  still requires the original saved_groups migration to be present in the hosted
  database; this implementation neither reapplies nor verifies live SQL.

## Compatibility and limits

This is an experimental, user-triggered DOM helper, not an official Facebook API
integration. Facebook may change its layout, put suggested groups on the directory,
or virtualize lists. Therefore the preview may be incomplete or include a link
that does not prove membership. Nothing promises collection of all joined groups.
A layout failure produces an error instead of fabricated results. Review every
export and stop on Facebook restrictions; no restriction bypass is implemented.

Official reference checks were attempted for the Chrome activeTab documentation
(<https://developer.chrome.com/docs/extensions/develop/concepts/activeTab>) and
Meta's API changelog (<https://developers.facebook.com/docs/graph-api/changelog/version19.0/>).
Both requests were blocked by this environment's outbound proxy (CONNECT 403).
Current Meta permission/terms compatibility and actual Facebook layout behavior
are not verified. No official support or platform approval is claimed. Review
applicable platform terms before using the experimental helper on a real account.
The file-import workflow remains usable independently with user-supplied material.

## Validation

See the actual results in the accompanying change report. Automated tests use
synthetic Facebook pages and mock Chrome/backend APIs; they do not use your account.
A separate native unpacked-extension test reports browser administrator-policy
blocks as BLOCKED, not PASS. Live Facebook collection and hosted persistence must
still be checked in your own desktop Chrome session. No test changes users or profiles.

Manual acceptance: collect a visible batch, uncheck one entry, export, import into
Preview, check score explanations, save one group, reload My Groups, import/save
again to confirm duplication handling. Confirm an individual group/post page is
rejected, and that collection stops at a Facebook dialog/challenge. Google sign-in
continues through the unchanged dashboard authentication flow.

### Checked on 2026-10-22

- Frozen pnpm installation: PASS (existing optional native build-script warnings).
- ESLint and strict TypeScript: PASS.
- Vitest: 151 PASS; Node script tests: 3 PASS (154 total, no skips).
- Production dashboard + MV3 extension build and manifest boundary check: PASS.
  Plasmo's optional registry version check can emit EAI_AGAIN behind this proxy;
  the command and actual extension compilation succeeded.
- Playwright: 66 PASS across desktop/tablet/mobile, including synthetic collector,
  import/assessment/save, popup consent/selection/export, denial handling and
  existing accessibility checks.
- Native Chrome installation: BLOCKED, `Extensions.loadUnpacked`: “Loading of
  unpacked extensions is disabled by the administrator.” No policy changed.
- Actual Facebook DOM compatibility, current Meta terms support, and hosted
  persistence for this flow: NOT VERIFIED. No live SQL executed.

A locally packaged extension targets the Phase 2 Preview origin
`https://staysuiteph-growth-engine-git-feat-ph-004ea4-mlvnpcrbs-projects.vercel.app`.
The package is a build artifact, not committed credentials or a Chrome Web Store
release. The built popup is additionally checked against that configured origin
using a mocked destination; that is not evidence of a Ready Vercel deployment.

## Connected transfer follow-up

Version 0.0.2 adds direct selected-group transfer to the dashboard with an optional,
user-approved dashboard host grant. JSON export is now a fallback. See
[CONNECTED_GROUP_IMPORT.md](CONNECTED_GROUP_IMPORT.md) for the current permission
model, local-only testing instructions and limitations; it supersedes the earlier
zero-optional-host-permissions description for the new build.
