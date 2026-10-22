# Phase 1 stabilization — 2026-10-22 (Asia/Manila)

Branch: `feat/phase-1-foundation`. PR: https://github.com/mlvnpcrb/staysuiteph-growth-engine/pull/1.
The original foundation commit is `b5b9b24ec24f9bdaeea4112e0a0e0ef1c0cce1c5`.
These results supersede the historical PHASE_1_VALIDATION.md baseline.

## Changes reviewed and stabilized

- Reduced dependency advisories from 9 high / 11 moderate / 2 low to 1 high / 8 moderate /
  1 low, with zero critical. See SECURITY_REVIEW.md for every original advisory,
  retained paths, exploitability, compatible updates, and limitations. The full audit
  is intentionally reported as nonzero, not passed.
- Kept Next.js and Plasmo versions intact. Added a version-controlled CSP parser Map
  adapter instead of silently forcing an incompatible parser API. Verified the
  development manifest preserves directives and adds the intended loopback source.
- Added an immutable follow-up migration restricting profile column grants. Users
  may insert their own id/name and update their own name; they cannot rewrite the
  creation timestamp or ownership. Original migration history is preserved.
- Sync now fails closed with a generic 503 on Auth-service outages/exceptions and
  with 401 on invalid/missing credentials. Mocked tests ensure caller-supplied IDs
  never override verified Auth identity and sensitive error details are not returned.
- Failed logout is no longer silently treated as successful revocation. Retry guidance
  is shown. Auth callback redirects and proxy responses explicitly disable caching.
- Closed mobile navigation is excluded from keyboard and accessibility traversal.
  Focus trapping, Escape, focus restoration and resize behavior are checked. Fixed
  illustration-caption contrast while retaining the existing design system.
- Strengthened extension CSP and checks for optional permissions, background channels,
  externally-connectable access and host permissions. Added separate popup harness
  and real-install test commands so installation failures are not disguised as passes.
- Pinned CI to Ubuntu 24.04 and updated Playwright within major 1. Quality, browser,
  and database jobs now execute independently. The original `validate` gate requires
  all three to succeed; no required protection is bypassed. Failure traces are saved.

## Quality results

Environment: Node 24.19.0, pnpm 10.28.2, installed Chromium 154.0.8037.57.
The host pnpm shim is version 11, so commands used the pinned pnpm via npx with a
writable /tmp npm cache and pnpm store. These paths are not project configuration.

| Check                                    | Result                   | Evidence / limit                                                                                                         |
| ---------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Frozen dependency installation           | PASS                     | `pnpm install --frozen-lockfile`; lockfile and committed patch apply                                                     |
| Lint                                     | PASS                     | Applications, shared packages, tests and Node verification scripts; zero warnings                                        |
| TypeScript                               | PASS                     | Root tooling/tests plus all six app/shared packages                                                                      |
| Unit and embedded PostgreSQL/RLS tests   | PASS                     | 38 tests; 15 input contracts, 11 migration/RLS checks, 12 mocked auth/API checks                                         |
| Dashboard production build               | PASS                     | Next.js 16.4.2 production output                                                                                         |
| Chrome extension production build        | PASS                     | Plasmo 0.90.5 Chrome MV3 output; icon generation works after sharp update                                                |
| Production manifest verification         | PASS                     | Explicit CSP; zero regular/optional/host permissions, content scripts, external connections or background auth           |
| Development CSP adapter smoke check      | PASS                     | Actual Plasmo dev build preserved script-src, object-src, base-uri; added expected localhost source                      |
| Playwright browser suite                 | PASS                     | 39 checks on desktop/tablet/mobile; installed Chromium used                                                              |
| Automated accessibility scans            | PASS                     | Overview: light/dark at all three viewports, WCAG 2 A/AA + 2.1 A/AA axe tags; not a complete accessibility certification |
| Native unpacked extension installation   | BLOCKED                  | `pnpm test:extension` exits 2: Chromium reports administrator-disabled unpacked loading; policy was not changed          |
| Supabase startup                         | BLOCKED                  | `public.ecr.aws/v2/` image pulls return Forbidden                                                                        |
| Real Supabase pgTAP suite                | BLOCKED                  | `pnpm db:test`: connection refused at 127.0.0.1:54322; ten assertions are committed but were not executed here           |
| Live signup/login/session refresh/logout | BLOCKED                  | No configured Supabase credentials or running Auth service                                                               |
| Full dependency security audit           | FAIL / retained findings | 0 critical, 1 high, 8 moderate, 1 low; audit exits nonzero                                                               |
| Production-install dependency audit      | FAIL / retained finding  | 1 high, optional Sass/watcher/braces path; no app HTTP input route found to the vulnerable parser                        |

The popup harness runs the actual built HTML/CSS/JS under the manifest CSP on a local
intercepted HTTP origin, and checks visible content and dashboard navigation. It is
**not** an installed extension and does not exercise Chrome permission enforcement.
The native-install command uses a disposable browser profile and respects Chrome policy.
There is no extension token pairing, backend synchronization client, or Facebook access
implemented; those flows are not claimed as tested or complete.

RLS tests execute actual migration SQL inside PGlite with a minimal Auth schema. Mocked
SDK tests exercise application boundary decisions. Neither substitutes for Supabase JWT,
refresh-cookie, revocation, signup/login, PostgREST column grants, or real pgTAP validation.
Signup and password-recovery UI remain unimplemented as in the original foundation.

## UI/UX review

Reviewed navigation and all ten section routes, desktop/tablet/mobile layout, light/dark
appearance, keyboard focus, empty-state copy and links, login labels/input constraints,
error retry controls, 404 routing, loading status markup and reduced-motion CSS. The two
confirmed findings (hidden drawer links and caption contrast) were fixed. Screenshots:
[desktop](images/overview-desktop.png), [tablet](images/overview-tablet.png),
[mobile dark](images/overview-mobile-dark.png). Existing screenshots were refreshed.
The complete native login/logout/session lifecycle and all possible error states require
live backend validation; the review does not certify them by inspection alone.

## PR #1 investigation

The public PR checks page and job page were accessible even though API requests were not:

- PR base: `chore/initial-project-setup`; head: `feat/phase-1-foundation`.
- GitHub exposed synthetic merge ref `de80554b4f7d861837240cd6151f53fcb2f3f0e1`, with
  the original base and feature commits as parents. Local `git merge-tree --write-tree`
  also succeeds. No source conflict was observed; mergeability is distinct from protections.
- Original job: https://github.com/mlvnpcrb/staysuiteph-growth-engine/actions/runs/39731894079/job/119668584468
  reports successful install, lint, typecheck, unit tests and builds, followed by failure
  at `pnpm exec playwright install --with-deps chromium`. Browser and database tests
  were then skipped. The detailed anonymous step-log URL returns 404, so the precise
  browser-install error is unverified. Runner pinning and browser-tool updates address
  reproducibility; they are not evidence that the original root cause is proven fixed.
- `gh pr view` returns `POST https://api.github.com/graphql: Forbidden`.
  The branch-protection REST request also returns Forbidden. Required reviews, rules,
  current API mergeStateStatus and protection requirements remain unverified.
- PR body update is attempted after pushing. Any API rejection is reported in the final
  handoff; docs/PHASE_1_PULL_REQUEST.md preserves the prepared update.

## Recommendation and remaining gates

**Needs More Work before merge signoff or a production-readiness claim.** The source is
stabilized and local executable checks pass, but green current remote CI, branch/review
requirements, real Supabase Auth/pgTAP results and supported native extension installation
remain unverified or blocked. Review the retained dependency risks explicitly; the
production-install high finding has no published patch. Parcel dev-server loopback
binding alone does not prevent malicious-site CORS reads, so use an isolated profile
with no unrelated browsing and avoid exposure until a coordinated upstream fix is adopted.

Do not merge automatically. No Phase 2 feature, Facebook automation, publishing API,
pairing system, or credential storage was added.
