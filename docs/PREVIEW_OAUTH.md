# Preview Google OAuth: one click on the current deployment

Preview OAuth now derives an exact allowlist from server-side Vercel system variables:
`VERCEL=1`, `VERCEL_ENV=preview`, `VERCEL_URL`, and `VERCEL_BRANCH_URL`.
Only the current deployment hostname and its branch alias are accepted. Incoming Host,
X-Forwarded-Host, query strings and arbitrary *.vercel.app URLs do not grant trust.
The action sends Supabase the callback on the exact validated Origin the user opened;
the callback independently validates its request origin against that same allowlist.
PKCE, cookie-write enforcement, fixed dashboard destination and redacted diagnostic
categories are preserved. No code/verifier/token is forwarded between hosts or logged.

A stale SITE_URL on Preview no longer redirects users to Phase 1. Missing/invalid Preview
metadata fails closed; it does not fall back to another branch's SITE_URL. Custom Preview
domains are not automatically trusted. Production and local development retain the
existing fixed SITE_URL behavior, including localhost support. No database/RLS changes.

## One-time platform configuration

1. In Vercel project Environment Variables settings, ensure **Automatically expose System
   Environment Variables** is enabled. Vercel supplies the metadata; do not enter deployment
   hostnames manually. Keep Supabase URL/publishable key and demo mode=false in Preview.
2. In Supabase project `kqjqcahysbmsaxlaipub` → Authentication → URL Configuration →
   Redirect URLs, retain existing entries and add this project/team-scoped pattern:

   ```text
   https://staysuiteph-growth-engine-*-mlvnpcrbs-projects.vercel.app/auth/callback
   ```

   `*` matches non-separator characters (including hyphens), not dots/slashes. The project
   prefix, team suffix and exact callback path constrain the pattern. This covers the
   observed branch and unique deployment URLs without a new entry per deployment.
   Only trusted project Preview code should be deployed under these matching addresses.
   Do not use a universal `https://*.vercel.app/**` pattern. Existing exact callback URLs
   can remain, and Production should retain exact redirect entries and its fixed Site URL.
3. Do not change Supabase's Site URL, Google Client Secret, provider configuration or
   Google's authorized callback (`https://kqjqcahysbmsaxlaipub.supabase.co/auth/v1/callback`).
   Only the additional redirect allowlist entry is needed for this feature.
4. Deploy only the Phase 2 branch, then open its branch Preview or unique deployment URL.
   One Google click must start OAuth on that same origin, without a detour to Phase 1.

Changing SITE_URL for each Preview branch is no longer required. These platform settings
were not changed by the code commit: authenticated Vercel/Supabase access is unavailable
in this execution environment. If the pattern is absent, Supabase can reject/fall back from
redirectTo; code tests cannot prove the hosted allowlist is configured. Live login remains
NOT VERIFIED until the actual Preview is tested with the existing Google account.

## Verification

Unit tests cover first-click OAuth initiation from both trusted Preview hosts with a stale
SITE_URL, same-origin callback exchange, unknown Preview/foreign hosts, spoofed forwarding
headers, malformed/missing metadata and unchanged fixed production/local behavior. Existing
PKCE/cookie/error tests remain in the full suite. No new user or profile is required.

Official sources checked during implementation:
- [Vercel system-variable definitions](https://github.com/vercel/vercel/blob/main/packages/functions/src/get-env.ts)
- [Supabase redirect wildcard documentation](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/redirect-urls.mdx)

Direct Vercel documentation access was proxy-blocked; official GitHub source was available.

Validation for this fix: frozen installation, lint, typecheck and both production builds
PASS; **146 automated tests PASS** (143 Vitest + 3 Node); **48 browser tests PASS**.
Both apps rebuilt; Chrome MV3 manifest verification passed. These are local/mocked and
browser-fixture results, not a claim of live Google login or hosted allowlist verification.
