# Google OAuth callback failure — Phase 1

## Evidence and root-cause assessment

Reported Preview origin:

`https://staysuiteph-growth-engine-ayi4mifww-mlvnpcrbs-projects.vercel.app`

Reported behavior: Google returns to `/auth/callback`, then `/login?error=callback`;
Vercel reports 307 on the callback, and two Preview hostnames occur in runtime logs.

**307 is the normal `NextResponse.redirect` status, not proof of a failed network request
or a particular Supabase error.** The original code returned the same login error for:

1. An `error` query parameter from the provider.
2. A missing or empty `code` query parameter.
3. Missing Supabase URL or publishable key (`environment().configured` false).
4. Any error returned by `exchangeCodeForSession`.
5. Any exception from client creation or exchange.

The old catch discarded the error classification. The cookie adapter also caught and
ignored every write failure, including writes in Server Actions and Route Handlers,
where cookies must be persisted. Therefore the historical 307/login sequence cannot
identify which condition occurred. No live logs containing a safe classification were
provided. This session has no authenticated Vercel/Supabase access; fetching the supplied
Preview and Supabase debugging documentation is blocked by proxy HTTP 403. No hosted
configuration, live code/verifier presence, or successful live exchange is asserted.

**Leading hypothesis: an origin mismatch loses the PKCE verifier.** The old Google action
created the verifier cookie on the browser's current Preview host, but chose `redirectTo`
from `SITE_URL`, independently of that host. If login begins on host A and `SITE_URL` points
to B, the browser returns to B without A's host-only verifier. The real installed SDK then
returns `pkce_code_verifier_not_found` before calling the token endpoint. Regression tests
reproduce this exact mechanism with separate host jars and no network request; a same-jar
exchange succeeds with the actual SSR SDK and a mocked token endpoint. Two hostnames in
aggregate logs are supporting evidence, not proof that this particular login crossed hosts.

## PKCE and cookie inspection

Installed versions: `@supabase/ssr` 0.8.0 and `@supabase/supabase-js` / Auth 2.95.3.
The shared `serverDatabase` uses `createServerClient`, which forces `flowType: "pkce"`,
`persistSession: true`, `autoRefreshToken: false`, and `detectSessionInUrl: false`.

- `signInWithOAuth` generates the S256 challenge and stores the verifier through the SSR
  adapter immediately, before returning the authorize URL. No implicit token flow is used.
- Default cookie name is `sb-<project-ref>-auth-token-code-verifier` (chunking supported).
  `getAll`/`setAll` preserve the SDK's chunking and encoding; there is no manual cookie parser.
- SDK defaults are Path `/`, SameSite `Lax`, max-age 400 days, HttpOnly `false`, and no
  explicitly configured Secure or Domain attribute. These are inspected defaults, not
  claims of extra hardening. No Domain means host-only; HTTPS does not share cookies between
  Preview hosts. Lax permits the ordinary top-level GET return from Google/Supabase.
  The provider's authorization code has its own short expiry and single-use semantics.
- SSR reads the verifier from the callback request's cookie store. On successful exchange,
  SDK storage writes session cookies and removes the verifier. Next's mutable cookie store
  attaches Route Handler and Server Action writes to their responses.
- The proxy refreshes sessions with the same SDK and forwards cookie attributes to its
  response. There is no code that deliberately transfers a verifier to another origin.
- No cookie Domain expansion, verifier transfer, localStorage workaround, implicit flow,
  secret key, CSRF relaxation, or RLS change is part of this fix.

## Minimal defensive changes

1. Reuse a strict trusted `SITE_URL` origin validator for the action and callback.
2. Before creating a verifier, compare the browser Server Action `Origin` with `SITE_URL`.
   If they differ, log `oauth_origin_mismatch` and redirect to the trusted origin's **login**
   page, without forwarding a code, query string or verifier. The user starts a new login
   there. Missing Origin fails closed. Next's existing Server Action CSRF checks stay enabled;
   no forwarded header or arbitrary return URL chooses the OAuth destination.
3. A callback on a different origin fails closed with `callback_origin_mismatch`. It never
   forwards the incoming code elsewhere. Missing code and provider error are classified first.
4. Google start and callback require writable cookies. Failures now throw a sanitized
   `AuthCookieWriteError`, rather than implying the verifier or session was persisted. Read-only
   Server Components retain their existing best-effort adapter and proxy refresh architecture.
5. Emit only fixed error categories. No raw SDK error, SDK message/code, URL, request header,
   callback query string, cookie name/value, user ID, code, verifier, token or secret is logged.
   Existing login errors remain generic; callback responses remain private/non-cacheable.

## Diagnostic categories and next action

The application log shape is only `[auth] { category: "<fixed category>" }`.
Vercel's own request/deployment metadata is separate; do not copy credential-bearing URLs
or headers from platform logs or DevTools.

| Category | Meaning / interpretation |
| --- | --- |
| `oauth_configuration_invalid` | Missing backend configuration or absent/invalid SITE_URL; OAuth was not started. |
| `oauth_origin_missing` | The Server Action has no Origin; OAuth was not started. |
| `oauth_origin_mismatch` | Login started on a different origin from SITE_URL; browser is moved to trusted login before cookie creation. |
| `oauth_cookie_write_failed` | Verifier-cookie write failed; OAuth was not started successfully. |
| `oauth_start_failed` | OAuth client creation/authorize initiation failed; backend details are withheld. |
| `callback_provider_error` | Supabase/provider returned an error parameter; no code exchange attempted. |
| `callback_missing_code` | No nonempty code query parameter; no exchange attempted. |
| `callback_not_configured` | Missing Supabase settings or invalid/missing SITE_URL in the callback deployment. |
| `callback_origin_mismatch` | Callback host/scheme/port differs from configured SITE_URL; no exchange attempted. |
| `callback_missing_verifier` | SDK could not retrieve a PKCE verifier. Check origin, blocked cookies, new browser, cleared cookies, consumed callback, or overlapping attempts. |
| `callback_verifier_mismatch` | Supabase reports `bad_code_verifier`; overlapping tabs/login attempts, wrong stored verifier or project can cause this. |
| `callback_flow_expired` | Supabase reports expired flow state; start a fresh login. |
| `callback_flow_not_found` | Supabase reports missing flow state; possible reused code or wrong project. |
| `callback_invalid_token_response` | SDK did not receive a usable session/user response from the token endpoint. |
| `callback_auth_unavailable` | Retryable Auth fetch error or other SDK status 5xx; investigate service/network health without exposing request details. |
| `callback_exchange_rejected` | Another returned SDK/Auth exchange error; category alone deliberately does not expose backend details. |
| `callback_cookie_write_failed` | Session persistence failed; no successful dashboard redirect is claimed. |
| `callback_unexpected_error` | Other thrown client/exchange exception; no exception contents logged. |

A category establishes a failing stage, not always its underlying cause. In particular,
missing verifier can have several causes, and generic exchange rejection cannot safely be
called an expired-code error without the corresponding SDK code. A successful exchange
redirects to `/dashboard/overview` without an application diagnostic log.

## Preview configuration correction and retest

If the reported origin is the canonical Preview used for this test, set branch-scoped
Vercel **Preview** `SITE_URL` exactly to:

`https://staysuiteph-growth-engine-ayi4mifww-mlvnpcrbs-projects.vercel.app`

Allow this exact Supabase application redirect:

`https://staysuiteph-growth-engine-ayi4mifww-mlvnpcrbs-projects.vercel.app/auth/callback`

The Google Cloud provider callback remains:

`https://kqjqcahysbmsaxlaipub.supabase.co/auth/v1/callback`

Keep `STAYSUITE_DEMO_MODE=false`; Supabase URL/publishable key must belong to project ref
`kqjqcahysbmsaxlaipub` in both the initiation and callback deployments. The original OAuth
commit did not include SITE_URL in Turbo's build inputs; the preceding local preparation
commit fixes passing/hashing it. A missing SITE_URL at initiation would cause a configuration
error before Google, so that fact alone does not explain the reported callback failure.

After a new deployment, do not assume this immutable hostname serves the new code. Verify
that the selected canonical Preview origin/alias resolves to the diagnostic commit, and
configure SITE_URL and the allowlist for **that** exact origin. A stable branch Preview alias
can be used if it is verified to serve the desired deployment. Do not start on an immutable
URL and return to a different alias. Avoid overlapping sign-in attempts/tabs. No fallback to
VERCEL_URL or caller-controlled forwarded host was added.

To distinguish the live failure:

1. In a fresh browser profile, visit the canonical Preview origin `/login`.
2. Use one Google sign-in attempt. In DevTools inspect only whether a verifier cookie is
   set and then sent on callback, plus its host/path/SameSite attributes. Do not reveal or
   export its value, full authorize URL, callback query, cookies or tokens.
3. Confirm the start host, configured SITE_URL and callback host match locally in the
   administrator/browser UI; do not add their values to application diagnostics.
4. Check the fixed `[auth]` category in Vercel logs for the diagnostic deployment. Use the
   table above to classify the failure. If no category appears, verify the deployed commit
   and whether deployment protection/proxying prevented the Route Handler from running.
5. After a successful callback, verify dashboard access, reload, refresh and logout. Cancel
   a separate new attempt and verify generic failure without authenticated access. The
   authenticated API and database owner-isolation checks remain independently necessary.

No Production settings or hosted schema were changed. The diagnostic/fix must be deployed
as Preview before live results can be determined. PR #1 is not merged; Phase 2 is not started.

Additional deployment checks: `NEXT_PUBLIC_*` values are built into the Next.js output;
changing only runtime settings without rebuilding can leave a stale Supabase project/key.
A different Supabase project also changes the SDK cookie storage prefix. Verify both
initiation and callback serve the same intended configuration and commit, including after
a stable alias is retargeted. Existing Vercel deployment protection remains enabled; do
not disable it as a proposed PKCE fix. A Server Action encryption-key/version mismatch
would generally fail before reaching Google, so it does not by itself explain this reported
post-Google callback failure. Two Vercel metadata hostnames can also represent different
attempts or an alias and immutable deployment; inspect the browser's actual origin sequence
before declaring a cross-host flow proven.

## Validation performed — 2026-10-22

- Frozen pnpm 10.28.2 install passed; no dependency/lockfile changes.
- Lint and strict TypeScript checks passed.
- 71 Vitest + 3 Node script tests passed. New/expanded tests cover every callback
  classification, sanitization of diagnostics, exact HTTPS Preview redirectTo, origin mismatch
  before any verifier write, mandatory cookie-write failure, read-only Server Component
  compatibility, real SDK host-only verifier loss, and same-jar session persistence with
  a mocked token endpoint. They do not contact Google or the hosted Supabase project.
- Production dashboard build passed. The extension build was a Turbo cache hit; MV3
  manifest verification passed. Its replayed optional updater DNS warning is unrelated.
- All 39 Playwright checks passed with system Chromium across desktop/tablet/mobile;
  these use demo/unconfigured auth fixtures and do not establish live Google login success.
- Existing migrations, proxy refresh, RLS policies and API authorization were not changed.
- Hosted Preview inspection, remote environment verification and live OAuth remain blocked
  by missing platform authentication and proxy HTTP 403. No deployment or push was initiated.

The work is committed locally on `feat/phase-1-foundation` for a Preview-only deployment
once the target can be verified. It has not changed the running Preview or Production.
