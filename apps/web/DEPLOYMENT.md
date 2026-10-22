# Dashboard Preview deployment

Deploy `feat/phase-1-foundation` as **Preview** in the existing
`staysuiteph-growth-engine` Vercel project. The setup branch
`chore/initial-project-setup` does not contain this application; redeploying
its initial commit with Root Directory `apps/web` will fail.

Keep Root Directory `apps/web`. The install/build commands in `vercel.json`
resolve the workspace root and use the pinned pnpm version. Do not change
the Production branch, promote the Preview, or merge PR #1 to test this app.

Set `STAYSUITE_DEMO_MODE=false` in Preview. Configure the project's public
Supabase URL and publishable key in Vercel, and set `SITE_URL` to the exact
canonical HTTPS Preview origin used in the browser. Allow that origin plus
`/auth/callback` in Supabase. Never commit private keys or credentials.

See [the deployment runbook](../../docs/PREVIEW_DEPLOYMENT.md) and
[OAuth callback diagnosis](../../docs/OAUTH_CALLBACK_DIAGNOSIS.md) for
configuration checks, safe diagnostic categories and manual verification.
A Ready deployment does not by itself prove a successful live Google login.
