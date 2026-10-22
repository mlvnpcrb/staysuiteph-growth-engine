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
email/password; signup and password recovery UI are not included. Add the local callback
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
