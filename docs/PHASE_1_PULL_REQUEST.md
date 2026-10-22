# feat: establish StaySuite Phase 1 foundation

The repository now has a pnpm/Turborepo foundation with a responsive Next.js dashboard,
a Plasmo Chrome MV3 companion, and shared UI, type, validation, and database packages.
All ten agreed sections are routed. Light/dark theme, mobile navigation, loading/error/
empty states, and explicit preview labels make the shell usable without invented data.

Supabase SSR authentication primitives, a token-validated read-only sync contract, an
owner-scoped profiles migration, and RLS tests establish backend boundaries. The extension
has no Facebook permissions or publishing capability; pairing and functional integrations
are deferred. No Phase 2 behavior is included.

Validation: frozen install, lint, strict typecheck, production builds and manifest check passed;
24 unit/PostgreSQL tests and 27 desktop/tablet/mobile browser checks passed. Full Supabase
startup/pgTAP execution is blocked by the container registry's HTTP 403. Live Supabase Auth
is unverified. Remaining audit advisories: 0 critical, 9 high, 11 moderate, 2 low; production
scope has one unpatched braces advisory via optional Next/Sass tooling. See
`docs/PHASE_1_VALIDATION.md` for exact limitations and commands.

Setup: `README.md`. Architecture and preview screenshots: `docs/ARCHITECTURE.md`.
