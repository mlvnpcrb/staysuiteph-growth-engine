# Phase 1 architecture decisions

## Workspace boundaries

`apps/web` is a Next.js App Router dashboard with React 19, Tailwind 4, next-themes,
and a shared shadcn/ui Button adapted for the StaySuite palette (Radix Slot, CVA, class merging). `components.json`
configures shadcn aliases for shared UI. Upstream Button source: https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/button.tsx; the MIT notice is retained in packages/ui/LICENSE.md. `apps/extension` uses Plasmo and React 18,
which is deliberately isolated for Plasmo compatibility; it targets Chrome Manifest V3.
`packages/ui`, `types`, `validation`, and `database` expose source modules consumed
by the app bundlers. Strict no-emit TypeScript checks run independently for every package.
Turborepo orchestrates build and typecheck; no application keys are needed to build.

## Experience

The shell uses coastal navy (#153e47), deep teal (#106b64), neutral mist (#f4f7f8),
and restrained sand (#edcf99) in an original CSS accommodation illustration. System
Avenir/Segoe typography avoids remote font requests. Navigation runs vertically on
desktop and in a dismissible drawer on smaller screens. Semantic headings, labels,
focus styles, skip navigation, reduced motion, dark theme, skeleton loading, route
errors and honest empty states form the accessibility baseline.

All ten requested sections are routed. Counts use a dash rather than invented metrics.
All operational sections are labeled foundation previews with no live integration.
Theme preference is the only persisted local UI setting.

## Authentication and synchronization

Supabase SSR clients use cookies on the dashboard. A Next.js proxy refreshes sessions;
the dashboard layout independently verifies the user with `getUser`. Server actions
validate inputs and invoke Supabase Auth. Password login and sign-out are foundation
primitives; self-service onboarding and recovery screens are deferred. Callback exchange
always redirects to a fixed same-origin dashboard path. Demo mode is explicit and off by
default, and grants no API or database access.

`GET /api/v1/sync` is a read-only authenticated contract: it requires a bearer access token,
validates it against Supabase Auth, and returns only the authenticated user ID, server time,
and `not_connected`. It never trusts a client-provided user/tenant ID or reads privileged
keys. Responses disable caching; no permissive CORS is provided. The extension does not
pair or exchange tokens yet, so it cannot claim a synchronized session. A future pairing
protocol must use PKCE/short-lived single-use codes, explicit user consent, token lifecycle
and revocation, exact origin checks, and tenant-scoped backend operations. Do not put
privileged keys, Facebook credentials, or refresh tokens into content-script messages.

## Database

The initial migration creates only user-owned profiles. Identity comes from `auth.uid()`;
RLS enforces read/insert/update ownership and checks updated values. No anonymous grants
or service-role client are used. SQL tests cover anonymous denial, cross-user reads,
forged ownership, valid owner updates, and deletion denial. Use UTC timestamps. Multi-user
organizations, campaigns, queue leases, and group data schemas are deferred to their
respective implementation phases rather than inventing unused tables now.

## Platform boundaries and deployment

No Facebook APIs, content scripts, discovery, publishing, account monitoring or scraping
are implemented. Final publishing must remain under fresh per-post user control. Delays
will organize preparation, never bypass platform restrictions. Group-rule verification is
a required future readiness gate.

Deploy the dashboard as a Next.js Node service with app-specific environment variables,
TLS, and Supabase redirect allowlists. Configure platform rate limits for login before
public launch. Build the extension separately with a fixed HTTPS dashboard URL and review
permissions before Chrome Web Store submission. Session refresh responses are not suitable
for shared CDN caching. Live Supabase authentication and pairing require integration checks
with an actual configured environment before production launch.

## Preview evidence

[Desktop light theme](images/overview-desktop.png) and [mobile dark theme](images/overview-mobile-dark.png) were captured from the production dashboard in explicit demo mode.

## Dependency review

Plasmo stays in devDependencies because it is a build tool, not extension runtime code.
React 18 is the extension runtime; React 19 is the dashboard runtime. Root pnpm overrides
pin patched tar and tinypool versions after advisory review; Vitest is pinned to 5.0.5.
The final full audit is not clean; see PHASE_1_VALIDATION.md. Review the upstream Plasmo
toolchain and optional Next/Sass advisory before treating this foundation as release-ready.
