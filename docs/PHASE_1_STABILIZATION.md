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

| Check                                    | Result                                              | Evidence / limit                                                                                                                                                            |
| ---------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen dependency installation           | PASS                                                | `pnpm install --frozen-lockfile`; lockfile and committed patch apply                                                                                                        |
| Lint                                     | PASS                                                | Applications, shared packages, tests and Node verification scripts; zero warnings                                                                                           |
| TypeScript                               | PASS                                                | Root tooling/tests plus all six app/shared packages                                                                                                                         |
| Unit/embedded PostgreSQL/script tests    | PASS                                                | 41 tests; 15 input contracts, 11 migration/RLS checks, 12 mocked auth/API checks, 3 startup-diagnostic checks                                                               |
| Dashboard production build               | PASS                                                | Next.js 16.4.2 production output                                                                                                                                            |
| Chrome extension production build        | PASS                                                | Plasmo 0.90.5 Chrome MV3 output; icon generation works after sharp update                                                                                                   |
| Production manifest verification         | PASS                                                | Explicit CSP; zero regular/optional/host permissions, content scripts, external connections or background auth                                                              |
| Development CSP adapter smoke check      | PASS                                                | Actual Plasmo dev build preserved script-src, object-src, base-uri; added expected localhost source                                                                         |
| Playwright browser suite                 | PASS                                                | 39 checks on desktop/tablet/mobile; installed Chromium used                                                                                                                 |
| Automated accessibility scans            | PASS                                                | Overview: light/dark at all three viewports, WCAG 2 A/AA + 2.1 A/AA axe tags; not a complete accessibility certification                                                    |
| Native unpacked extension installation   | PASS in CI; BLOCKED locally                         | GitHub job 119678655674 passed real installation/popup/navigation. Local command exits 2 because managed Chromium disables unpacked loading; policy was not changed         |
| Supabase startup                         | PASS in earlier CI; currently FAIL / external quota | Run 39736152031 started the real stack; later runs report a container-registry rate limit. Local image pulls remain HTTP 403                                                |
| Real Supabase pgTAP suite                | PASS in CI; BLOCKED locally/current rerun           | Native `pnpm db:test` succeeded in run 39736152031; suite contains ten assertions. Latest rerun cannot reach it due registry quota                                          |
| Live signup/login/session refresh/logout | BLOCKED / not claimed as passed                     | New `pnpm test:supabase:auth` covers disposable signup, browser login, automatic cookie refresh, logout, token API and PostgREST isolation. Registry quota blocks execution |
| Full dependency security audit           | FAIL / retained findings                            | 0 critical, 1 high, 8 moderate, 1 low; audit exits nonzero                                                                                                                  |
| Production-install dependency audit      | FAIL / retained finding                             | 1 high, optional Sass/watcher/braces path; no app HTTP input route found to the vulnerable parser                                                                           |

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

**Needs More Work before merge signoff or a production-readiness claim.** Quality and
browser jobs are green, and a real native pgTAP run succeeded. The expanded live-auth
check is still unexecuted because later database jobs hit container-registry quota.
GitHub API restrictions prevent confirming protection/review requirements or updating
the PR body. Review the ten retained advisories explicitly; do not bypass the failed
aggregate gate. Respect registry limits: restore authorized capacity/authentication or
wait for quota reset before rerunning the database job. No image-host or account rotation
was introduced. Parcel dev-server loopback binding alone does not prevent malicious-site
CORS reads; use an isolated profile with no unrelated browsing.

Do not merge automatically. No Phase 2 feature, Facebook automation, publishing API,
pairing system, or credential storage was added.

## Verified remote rerun at foundation stabilization commit 259e057

The public job pages now confirm:

- Quality job 119678655696: frozen install, lint, typecheck, unit tests and builds passed.
- Browser job 119678655674: updated browser installation, all browser tests, and real
  unpacked extension installation/popup/dashboard-navigation test passed. The earlier
  browser-installer failure is no longer reproduced in this run.
- Database job 119678655379: Supabase startup failed, so pgTAP was skipped. This is a
  remaining remote CI failure, not merely an unavailable local test. Its underlying
  error cannot be read through anonymous step-log URLs or the blocked GitHub API.
- A subsequent workflow change emits only fixed startup-failure diagnostic categories
  as a public job annotation. It does not print raw startup logs, JWTs, keys or credentials.
  Three Node tests check secret non-disclosure, diagnostic usefulness and annotation escaping.

Run: https://github.com/mlvnpcrb/staysuiteph-growth-engine/actions/runs/39735046963

The updated feature branch and synthetic merge ref have matching ancestry and no observed
source conflicts. PR body editing was retried after pushing and again returned
`POST https://api.github.com/graphql: Forbidden`; the prepared body remains committed.

## Latest integration coverage and exact remaining blocker

Run https://github.com/mlvnpcrb/staysuiteph-growth-engine/actions/runs/39736152031 at
commit 6181fe9 passed real Supabase startup, the native pgTAP command, quality checks,
39 browser checks and real unpacked-extension validation. It was followed by new
live-auth coverage at commits 26a8e26 and 51d525b, not application feature changes.

Later run https://github.com/mlvnpcrb/staysuiteph-growth-engine/actions/runs/39738447810
reports the sanitized database annotation:

> Container registry rate limit reached. | Supabase could not pull a required Docker image.

Quality and browser/native-extension jobs passed in that run. The database job failed
before pgTAP or live Auth. Its aggregate gate correctly fails. No green live-auth
result is invented. The CI workflow now keeps one run per PR commit, cancels stale
runs and starts only the Auth/Postgres/PostgREST/gateway services needed for this
foundation; this reduces redundant pulls without bypassing rate limits or health checks.

`pnpm test:supabase:auth` uses local CLI-generated keys in memory, refuses non-loopback
projects, creates random reserved-domain test accounts, and deletes them afterwards.
The admin key is used only for cleanup, never supplied to the dashboard or browser.
No status JSON, credentials, browser traces or raw provider error details are published.
CI temporarily lowers only the test stack JWT lifetime to 120 seconds to observe
automatic cookie rotation; the committed app default remains 3600 seconds. The test
checks refresh-token revocation, not immediate invalidation of already-issued access JWTs.
The script's local prerequisite reports BLOCKED; its full flow remains unverified until
a registry-capable CI run completes. No signup UI or extension pairing was added.
