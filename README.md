# StaySuite Growth Engine

Phase 1 foundation for Philippine accommodation hosts and guests. Facebook Groups only.
No discovery, AI generation, campaigns, lead collection, or Facebook publishing is implemented.

## Local development

Use Node.js 22.12+ (22 or 24 LTS) and pnpm 10.28.2 (`corepack enable`, then `corepack prepare pnpm@10.28.2 --activate`).

```sh
pnpm install --frozen-lockfile
cp apps/web/.env.example apps/web/.env.local
cp apps/extension/.env.example apps/extension/.env.development
pnpm --filter @staysuite/web dev
```

For the shell preview set `STAYSUITE_DEMO_MODE=true` explicitly in `apps/web/.env.local`.
Demo mode bypasses only dashboard sign-in; it does not grant access to backend data or the
sync endpoint. Keep it false in authenticated deployments. Without credentials and without
demo mode, the app displays setup guidance on `/login`.

For authenticated use, provide the Supabase project URL and **publishable** key, apply the
migration to a local Supabase instance, and provision a test user in Supabase Auth. Login uses
email/password or Google via Supabase SSR/PKCE; email signup and password recovery UI
are not included. Set `SITE_URL=http://localhost:3000` and add the local callback
`http://localhost:3000/auth/callback` to allowed redirects when using PKCE auth flows.

```sh
pnpm exec supabase start
pnpm db:reset
pnpm db:test
pnpm --filter @staysuite/extension dev
```

Load `apps/extension/build/chrome-mv3-dev` using Chrome → Extensions → Developer mode → Load
unpacked. Production: `pnpm --filter @staysuite/extension build`, then load
`apps/extension/build/chrome-mv3-prod`. The extension opens the configured dashboard and has
no Facebook host permissions, content scripts, token storage, or automatic publishing.

## Validation

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:extension # requires Chrome policy allowing unpacked extensions
pnpm db:test # requires local Supabase / Docker
```

CI runs these checks, including local database RLS tests. Unit tests also execute the actual
migration and RLS policies in embedded PostgreSQL (PGlite) with a minimal Auth schema;
this does not replace full Supabase integration tests. If Chromium is already installed,
set `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium` when running browser checks. App environment variables live in
each app, not a root dotenv file. Never put private keys in `NEXT_PUBLIC_` or `PLASMO_PUBLIC_`
variables. OpenAI is reserved server-side; no model requests or spend occur in this phase.

See [architecture](docs/ARCHITECTURE.md), [development skills](docs/DEVELOPMENT_SKILLS.md),
and [validation results](docs/PHASE_1_VALIDATION.md). Phase 2 requires separate authorization.
See [Google OAuth setup](docs/GOOGLE_OAUTH_SETUP.md) and the
[Vercel Preview deployment runbook](docs/PREVIEW_DEPLOYMENT.md) for hosted configuration,
target-checked migrations, and the manual sign-in verification checklist.

## Stabilization review

See [security findings and dependency decisions](docs/SECURITY_REVIEW.md) and
[the stabilization results](docs/PHASE_1_STABILIZATION.md). The full audit is not
clean: 1 high, 8 moderate, 1 low remain. Development servers stay on loopback;
this alone does not prevent malicious-site CORS attacks against older Parcel.
Use an isolated browser profile with no unrelated browsing while Plasmo dev runs.

`pnpm test:extension` attempts real unpacked installation using Chrome’s developer
protocol in a disposable profile. Administrator-disabled installation is reported
as BLOCKED (exit 2); no Chrome policies are changed. The browser suite separately
tests the built popup in an HTTP fixture under its CSP, which is not a substitute
for installed-extension or pairing validation. Pairing and Facebook integration
are still unimplemented.

The database CI job also runs `pnpm test:supabase:auth` against disposable loopback
Supabase users and the built dashboard. It tests provider signup/login, PostgREST
isolation, real API tokens, dashboard form login, automatic cookie refresh and logout.
CI uses a 120-second local JWT lifetime to make refresh observable; the committed
project default remains 3600 seconds. Local use requires a running isolated stack,
a dashboard build, installed Chromium and the same short test JWT setting. The test
refuses non-loopback stacks, keeps local keys/passwords in memory, and deletes its users.
No secret/status JSON or credential-bearing browser traces are published.
