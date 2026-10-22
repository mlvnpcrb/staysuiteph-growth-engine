# Local Google sign-in

The dashboard uses `@supabase/ssr` with PKCE. A same-origin Next.js Server Action starts Google OAuth and writes the verifier cookie. `/auth/callback` exchanges the code using that cookie, persists the session, and redirects only to `/dashboard/overview`. Provider errors and exchange failures return a generic error. Callback responses are private and non-cacheable. Existing `getUser()` route protection, session refresh, bearer API authorization, logout, and database RLS remain unchanged.

## Local configuration

Edit **`apps/web/.env.local`**, relative to the repository root (not a root `.env` file). This file is Git-ignored. Use:

```dotenv
STAYSUITE_DEMO_MODE=false
SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://kqjqcahysbmsaxlaipub.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<paste your Supabase publishable key here>
```

Find the publishable key in the project's Supabase dashboard under Settings → API Keys. Use the `sb_publishable_...` key. Do not put a Supabase secret/service-role key, Google Client Secret, or database password here. The publishable key is designed for public clients; security depends on verified sessions and RLS.

`SITE_URL` is a trusted server-side origin, never derived from caller-provided headers or redirect parameters. It must be an origin without credentials, path, query, or fragment. Production must use HTTPS; HTTP is allowed only for localhost/127.0.0.1 development. Configure production origin and its callback in Supabase before deployment. Keep demo mode disabled.

Restart the web development server after changing environment variables: run `pnpm dev` from the repository root, then visit `http://localhost:3000/login` and choose **Continue with Google**. Use localhost consistently, since cookies and redirect allowlists are origin-specific.

## Provider configuration

The supplied Supabase configuration is:

- Site URL: `http://localhost:3000`
- Allowed redirect URL: `http://localhost:3000/auth/callback`
- Google provider: enabled

In Google Cloud, the OAuth client's authorized redirect URI must be Supabase's provider callback: **`https://kqjqcahysbmsaxlaipub.supabase.co/auth/v1/callback`**. This differs from the Next.js callback above. Keep provider credentials exclusively in Supabase's provider configuration. Google consent-screen/testing restrictions may require adding the Google account as a test user.

Google may create a Supabase user on first sign-in according to the project's signup settings. Existing email/password login remains available for accounts with passwords.

## Database and manual verification

No schema or RLS changes are needed for this OAuth implementation. For this new hosted project, apply the existing migrations in `supabase/migrations/` in chronological order if not already applied; retain their RLS policies and column grants. No privileged credentials are required by the dashboard.

After adding your public key, verify Google consent, callback success, dashboard access, refresh, logout, and denial of dashboard access after logout. Test cancellation and another user's data isolation. The PKCE verifier is browser-bound: complete login in the same browser where it started. Do not copy callback codes between browsers or log them.

Automated checks cover SDK-generated S256 PKCE/verifier cookies, fixed callback destination, invalid origin configuration, provider failure, and code exchange failure/success. They do not prove live Google consent or the hosted project's RLS configuration. Live testing requires a configured publishable key and an interactive Google account; neither a secret key nor a database password should be supplied to the application or committed.

## Implementation validation (2026-10-22)

- Lint and TypeScript checks: passed.
- Unit/integration checks: 51 Vitest tests plus 3 Node script tests passed, including SQL/RLS regression tests in PGlite (not hosted PostgreSQL).
- Production dashboard build: passed; extension build was a verified Turbo cache hit and its manifest checks passed.
- Playwright: 39 checks passed using system Chromium across desktop, tablet, and mobile. These use demo/unconfigured environments, not live Google credentials.
- Live hosted Google OAuth and hosted PostgreSQL/RLS: not executed. The local publishable key remains blank; Google consent requires user interaction. Supabase documentation fetch was blocked by this managed environment's network policy. PKCE behavior was verified against the installed SDK source and a no-network SDK test.
