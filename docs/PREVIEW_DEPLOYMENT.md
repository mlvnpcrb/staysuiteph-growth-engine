# Phase 1 Vercel Preview verification

## Status — 2026-10-22

**No new Preview deployment has been created or verified by this session.** No exact
Preview hostname is available. Production has not been changed. Do not treat a local
Next.js build as a successful Vercel deployment or a mocked auth test as live Google OAuth.

Repository: `mlvnpcrb/staysuiteph-growth-engine`; branch: `feat/phase-1-foundation`.
Vercel project supplied by the user: `staysuiteph-growth-engine`.
Supabase project ref: `kqjqcahysbmsaxlaipub`.

Observed blockers:

- No Vercel/Supabase connector or authenticated CLI access is configured. No local
  `.vercel/project.json` or linked `supabase/.temp/project-ref` exists. No platform
  credential bindings or outbound identities were reported by the managed environment.
- Requests to `api.vercel.com`, `vercel.com`, `supabase.com`, and
  `kqjqcahysbmsaxlaipub.supabase.co` fail with `CONNECT tunnel failed, response 403`.
  Therefore remote root-directory settings, environment variable presence/values,
  deployment logs and migration history cannot be inspected here.
- The public GitHub PR #1 Vercel bot comment reports **Error**, updated Oct 22, 2026
  at 07:59 UTC, linking to this existing deployment detail page:
  https://vercel.com/mlvnpcrbs-projects/staysuiteph-growth-engine/Am5k5HW4znWeSteeTUWDEneq23Lh
  This is a Vercel details URL, not a verified running app URL. The comment does not
  establish the build failure cause or the deployment's target environment.

Do not paste service credentials into chat. Platform access should use the environment's
supported authenticated connection and allowed network destinations. The publishable key
belongs in Vercel's environment settings, not source control. Secrets are not needed by the
web application.

## Repository build configuration

`apps/web/vercel.json` specifies:

- Framework: Next.js; output directory: `.next`, relative to `apps/web`.
- Install: `cd ../.. && npx --yes pnpm@10.28.2 install --frozen-lockfile`.
- Build: `cd ../.. && npx --yes pnpm@10.28.2 exec turbo run build --filter=@staysuite/web`.

These commands assume Vercel **Root Directory = `apps/web`**, with access to files outside
that directory enabled. They use the repository lockfile, workspace packages and patched
dependencies. The filtered build excludes the Plasmo extension. Shared packages expose
TypeScript source and are transpiled by Next.js; output tracing explicitly includes the
repository root. Turbo includes `SITE_URL` in its environment/cache inputs and app dotenv
files in its file inputs, avoiding reuse across different auth configurations.

When platform access is available, verify the Vercel project ID/team and connected GitHub
repository before any action. Inspect Root Directory, external workspace-file access,
framework, command overrides, Node.js (22.x or 24.x), and Production branch settings.
Actual remote settings are **unverified**, even though the repository configuration exists.
Do not change project-wide settings or Production-scoped variables as part of a Preview-only
verification. Report conflicting project-wide settings before deploying. Never promote a
Preview or use `vercel --prod` during this task.

## Preview environment and deployment sequence

Use Preview scope, preferably restricted to `feat/phase-1-foundation`, for:

| Variable | Required value | Remote verified? |
| --- | --- | --- |
| `STAYSUITE_DEMO_MODE` | `false` | No |
| `SITE_URL` | Exact verified HTTPS Preview origin, no path or trailing slash | No |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://kqjqcahysbmsaxlaipub.supabase.co` | No |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | This project's publishable key, configured privately in Vercel | No |

The local `.env.local` file is not a substitute for Vercel Preview variables. Public Next.js
variables are embedded during build; changes require a new Preview build.

1. Inspect the authenticated Vercel project and verify the settings above. Keep Production
   unchanged. Select this Git branch and explicitly confirm deployment target **Preview**.
2. Obtain and verify the branch's stable Preview alias from Vercel, rather than guessing it.
   Set `SITE_URL` to that exact HTTPS origin in branch-scoped Preview variables. Use that
   origin for the entire login session; PKCE verifier cookies cannot move between hostnames.
   A stable alias permits rebuilding without changing the callback origin each time.
3. Start/redeploy the branch as **Preview** with all four variables available to the build
   and runtime. Inspect complete install/build logs. Record the deployed commit, immutable
   deployment URL, stable Preview alias, target environment, and Ready/Error status. A build
   against placeholder credentials does not prove connectivity.
4. Confirm the alias resolves to this exact deployment and `SITE_URL` equals the origin used
   for browser testing. If an immutable deployment hostname is used instead, `SITE_URL` must
   equal that hostname; do not start OAuth on one host and return to another. Vercel's
   `VERCEL_URL` is not automatically substituted into a literal `SITE_URL` string.
5. Preserve deployment protection. Test as an authorized Preview viewer; do not disable
   team protections to make a probe succeed.

## Supabase redirects

For the verified canonical Preview origin, add **`<exact Preview origin>/auth/callback`**
to Supabase Authentication → URL Configuration → Redirect URLs. This is a formula, not
an actual deployment URL; the exact value cannot be reported until the origin is known.
Keep the existing `http://localhost:3000/auth/callback` entry. Do not use a broad wildcard
or change the Supabase project-wide Site URL merely to test a Preview. The application
already supplies the explicit callback URL.

Google Cloud's authorized provider redirect URI stays:

`https://kqjqcahysbmsaxlaipub.supabase.co/auth/v1/callback`

The Google Client Secret stays solely in Supabase's provider configuration. Do not place
it, a Supabase secret/service-role key, or a database password in Vercel public variables.

## Hosted migration preparation and apply gate

The existing immutable files, in order, are:

1. `supabase/migrations/20261022053713_foundation_profiles.sql`: profiles identity table,
   Auth foreign key, forced RLS, owner-only SELECT/INSERT/UPDATE policies.
2. `supabase/migrations/20261022061314_restrict_profile_columns.sql`: narrows writes to
   inserting `id`/`display_name` and updating only `display_name`. Creation time remains
   server-owned. No DELETE or anonymous grant is introduced.

Do not copy the local `config.toml` over hosted Auth settings: local email-confirmation
and provider settings are not deployment configuration. No hosted writes were attempted.

In a supported authenticated administrator environment, with no credentials committed or
placed in command arguments:

1. Verify the account/organization and hosted project header/URL show project ref
   **`kqjqcahysbmsaxlaipub`** and the intended database. This URL alone does not prove that
   any existing database connection points there.
2. Using that environment's existing secure CLI authentication, link this checkout to the
   verified project: `pnpm exec supabase link --project-ref kqjqcahysbmsaxlaipub`. Check that
   the ignored `supabase/.temp/project-ref` exactly matches before proceeding. If secure
   platform/database access is unavailable, stop; do not share credentials in chat.
3. Run `pnpm exec supabase migration list --linked`. Inspect the read-only
   `supabase/verification/phase_1_preflight.sql` in the verified project's SQL Editor.
   The SQL output is schema evidence, not project-identity proof. If migration history
   exists, inspect `version`, `name`, and `statements` in
   `supabase_migrations.schema_migrations` in that same project; compare with the local SQL.
4. If both files are already applied, verify schema/policies/grants and do not reapply.
   If only the first is applied and matches, only the second should be pending. For a
   genuinely empty target, both should be pending and `public.profiles` absent. Stop on
   unexplained history, conflicting tables, changed migration statements, or schema drift;
   do not repair history, reset the database, or add `IF NOT EXISTS` to hide conflicts.
5. Run `pnpm exec supabase db push --linked --dry-run`. Inspect that its pending file list
   exactly matches the state established above; this is not a substitute for inspecting
   live schema. Then, and only then, run `pnpm exec supabase db push --linked`. Do not use
   `--include-all`, `--include-seed`, `db reset`, or any history-repair command here.
6. Repeat migration-list and read-only schema inspection. Require `relrowsecurity=true`
   and `relforcerowsecurity=true`, three owner policies using `auth.uid()`, no anonymous or
   PUBLIC table grants, authenticated SELECT and only the documented write-column grants,
   and the UUID Auth foreign key / 80-character display-name check.
7. Run the committed pgTAP file `supabase/tests/profiles.test.sql` only on a verified
   disposable test database with pgTAP available. It inserts fixed test users inside a
   rolled-back transaction; it is not a general production smoke test. `pnpm db:test`
   uses local Supabase by default and must not be reported as hosted validation. Use two
   disposable Google test accounts for hosted RLS isolation checks under their real tokens.
   Preserve RLS; never use a privileged key to test user isolation.

## Manual Google login/logout checklist

Record pass/fail, tested Preview origin and deployed commit. Do not record codes, tokens,
cookies, credentials or personal account details in logs/screenshots.

- [ ] Visit the verified Preview origin in a fresh browser profile; `/dashboard/overview`
      redirects to `/login` and no demo-workspace link appears.
- [ ] `/login` shows Continue with Google and email/password controls, with no missing
      configuration warning. Confirm provider/consent-screen test-user eligibility.
- [ ] Continue with Google reaches the expected Supabase/Google flow. Complete consent in
      the same browser. Return to the exact allowlisted Preview `/auth/callback`, then
      `/dashboard/overview`; no access/refresh token appears in the address bar.
- [ ] Reload and navigate dashboard sections; the authenticated session persists. Verify
      refresh after access-token expiry without recording cookie values. Authenticated
      responses and the callback must not be cached by shared CDN caches.
- [ ] Cancel a fresh Google sign-in attempt. The app shows a generic failure, without
      exposing provider details or granting a session to a previously unauthenticated user.
- [ ] Visit `/auth/callback` without a code, and test an expired/reused callback. The result
      is a generic login error; a caller-supplied external `next` URL is ignored.
- [ ] Request `/api/v1/sync` with no Authorization header and then an invalid bearer token:
      both are denied. A dashboard cookie alone is not API bearer authorization.
- [ ] Sign out. Protected dashboard navigation and reload return to login. The signed-out
      browser must not regain dashboard access through browser Back or a reused refresh token.
- [ ] In a separate browser profile, use a second disposable test account and verify each
      account can only access its own profile through authenticated data requests. Anonymous
      reads, cross-user reads/writes, ownership changes and timestamp writes remain denied.
- [ ] Reconfirm Production deployment, Production variables and PR #1 merge state are unchanged.

Live Google OAuth, session refresh and hosted RLS remain **unverified** until these checks
are performed against a Ready deployment and the intended hosted Supabase project.

## Local validation performed

| Check | Actual result |
| --- | --- |
| Frozen pnpm 10.28.2 install | Passed, all seven workspace projects |
| Lint / strict TypeScript checks | Passed |
| Unit and script tests | 51 Vitest + 3 Node tests passed; includes 11 embedded SQL/RLS checks |
| Configured Vercel build command, executed locally from `apps/web` | Passed; fresh Next.js build, dashboard only |
| Full workspace build / MV3 manifest verification | Passed; web cache hit from the fresh filtered build, extension rebuilt |
| Playwright | 39 checks passed on desktop/tablet/mobile using system Chromium |
| Turbo environment and graph inspection | SITE_URL is passed/hashed; filtered graph excludes extension |
| Next.js output tracing | Built tracing root matches repository root |
| Read-only migration preflight | Executed successfully against empty and migrated PGlite databases; forced RLS retained |
| Hosted migration list / apply / hosted RLS | Blocked; no verified authenticated target or network access; no hosted writes attempted |
| Remote Vercel settings / Preview variables / new deployment | Blocked; no authenticated access and proxy HTTP 403 |
| Live Google login / refresh / logout | Not executed |

Plasmo's optional update lookup logged a DNS error after a successful bundle; its command
exited 0 and manifest validation passed. Local browser checks run demo/unconfigured auth
fixtures, not the hosted project's Google provider. Existing security findings remain in
[SECURITY_REVIEW.md](SECURITY_REVIEW.md); this task does not establish release readiness.

The preparation is retained on the local feature branch. No push/deploy was initiated in
this session because the connected project's Git deployment target could not be verified
as Preview. Production settings were not modified, PR #1 was not merged, and Phase 2 was
not started.

Original migration SHA-256 values (unchanged):

```text
25b4660acc1c7cf3b6c51b2bb44b9c4394cf86a76c921d0440efc2efe1d8b22e  20261022053713_foundation_profiles.sql
f0ea5bd2d72e34b0838801c24d1b22dbc302cc6c4661c8b0731cfd651f02dfaf  20261022061314_restrict_profile_columns.sql
```
