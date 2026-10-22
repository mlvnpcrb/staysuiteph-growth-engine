# Phase 1 validation — 2026-10-22 (Asia/Manila)

Branch: `feat/phase-1-foundation`, based on the verified default branch
`chore/initial-project-setup` at `21775d48cc753a25625ba3b952a99fa3704c6225`.

## Actual final results

| Check | Result |
| --- | --- |
| pnpm install --frozen-lockfile | Passed with pnpm 10.28.2; all seven workspace projects |
| pnpm lint | Passed; zero warnings allowed |
| pnpm typecheck | Passed; tooling/tests plus all six application/shared packages |
| pnpm test | Passed; 24 tests: 15 validation/contract checks and 9 embedded PostgreSQL migration/RLS checks |
| pnpm build | Passed; Next.js production app and Plasmo Chrome MV3 bundle |
| Built extension manifest verification | Passed; popup exists, manifest_version 3, no permissions, host permissions, or content scripts |
| pnpm test:e2e | Passed; 27 checks across desktop, tablet, and mobile using installed /usr/bin/chromium |
| git diff --check | Passed for project-authored changes |
| Visual review | Desktop light and mobile dark captures reviewed; screenshots in docs/images |
| pnpm db:test | Could not run SQL assertions: local database unavailable after blocked Supabase startup |
| Full dependency audit | Nonzero: 0 critical, 9 high, 11 moderate, 2 low advisories remain |
| Production dependency audit | Nonzero: 1 high advisory in next → sass → @parcel/watcher → micromatch → braces 3.0.3; audit reports no patched braces version |

Commands in this managed environment used `npm_config_cache=/tmp/staysuite-npm npx --yes
pnpm@10.28.2` because the default pnpm binary is version 11. The local package store was
selected with `--store-dir=/tmp/staysuite-pnpm-store` for installation only; no environment-
specific store location is committed. The Supabase npm postinstall required its supported
`npm_config_https_proxy` setting using the inherited session proxy. No credentials were
printed or committed.

## Coverage and evidence limits

Browser checks exercise every navigation section, no horizontal overflow, theme persistence,
mobile drawer Escape/focus behavior, honest placeholders, unknown routes, explicit demo mode,
non-demo login redirection, missing configuration guidance, unauthenticated API denial,
and backend-unavailable responses. They use the built production dashboard.

The PostgreSQL tests execute the actual migration and RLS policies under separate anon and
authenticated roles. A minimal `auth.users` table and `auth.uid()` function represent the
Supabase Auth boundary. They verify anonymous denial, missing identity, cross-user read/write
isolation, owner updates/inserts, ownership reassignment denial, forged inserts, and deletion
denial. They do **not** validate a live Supabase Auth service, JWT issuance, cookie refresh,
or a real extension pairing flow.

The extension was bundled and its manifest inspected automatically. Chrome installation,
store submission, and live extension pairing are not claimed as tested.

## Blocked commands and upstream limitations

- Supabase changelog and Next.js authentication documentation requests returned HTTP 403
  at supabase.com. Current hosted documentation verification was unavailable.
- `supabase start` failed pulling images from `https://public.ecr.aws/v2/` with `Forbidden`.
  `supabase test db` then failed connecting to 127.0.0.1:54322 (connection refused).
  The pgTAP test file is committed and CI is configured to execute it with local Supabase.
- Playwright's browser download endpoint returned HTTP 403 (`Domain forbidden`). Tests
  succeeded using the preinstalled Chromium via `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.
- Plasmo logged a nonfatal updater lookup DNS error (`EAI_AGAIN registry.npmjs.org`) after
  creating its production bundle. The build exited 0 and output verification passed.
- Installation retains an upstream htmlnano/svgo peer warning and deprecated Plasmo-related
  packages. Full dependency audit still reports advisories, primarily in build tooling.
  Critical tar/Vitest/tinypool findings were removed through tested version updates. This
  is a foundation for review, not a claim of a clean security audit or completed live auth QA.

## Next steps within foundation review

Enable the required documentation/container-registry access, configure a Supabase test
project or local instance, run the committed pgTAP suite and live login/refresh/logout checks,
and review remaining upstream dependency advisories before public deployment. Extension
pairing, real group data, campaigns, AI generation, and any Facebook interaction are deferred.
Phase 2 has not begun.
