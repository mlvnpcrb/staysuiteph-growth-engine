# Phase 1 foundation — final review and stabilization

The foundation now has compatible dependency fixes, a reviewed CSP parser adapter,
stricter profile column grants, fail-closed sync outage handling, explicit auth
no-cache responses, truthful logout failure handling, and mobile keyboard/contrast
corrections. Next.js and Plasmo versions are preserved. The extension has an explicit
CSP and still requests no Facebook/host permissions or pairing capability.

Validation: frozen install, lint, strict typecheck, both production builds, manifest
checks, **41 unit/PostgreSQL/script tests and 39 desktop/tablet/mobile browser checks**
passed. Native extension installation/popup/dashboard navigation passed in GitHub CI.
Real Supabase startup and native pgTAP passed in run 39736152031 (commit 6181fe9).

Audit: **0 critical, 1 high, 8 moderate, 1 low**, reduced from 9/11/2. The unpatched high
is braces in glob tooling, including optional Next/Sass. No application HTTP input path
to it was found. Retained dev-tool exposure, exact paths and mitigations are documented
in docs/SECURITY_REVIEW.md and normalized audit snapshots. This is not a clean audit.

CI now pins Ubuntu 24.04, uses a supported Playwright version, avoids duplicate push/PR
runs and separates quality/browser/database jobs. The original validate gate still
requires every job to pass. The original browser-install failure no longer reproduces.
No source conflict was found; no protection or required review was bypassed.

**Current blocker:** later database jobs hit a container-registry rate limit before
expanded live-auth validation. A real-auth test is committed for disposable signup,
PostgREST isolation, token API access, browser login, automatic cookie refresh, logout
and refresh-token revocation. It has not completed in CI and is not claimed as passed.
The failed aggregate gate must remain respected until authorized registry capacity is
available and the database job succeeds. Local Supabase pulls are HTTP 403; local Chrome
installation is administrator-blocked, although native installation succeeded in CI.

GitHub API requests still return Forbidden, preventing this session from editing PR
metadata or confirming required reviews/protection settings. This file preserves the
prepared update; branch pushes update the PR's code and review documents normally.

**Recommendation: Needs More Work before merge signoff.** Complete the live-auth CI
run, inspect current protections/reviews, and review retained dependency risks.
No automatic merge, Phase 2 implementation, Facebook automation or credential storage.

Full results: docs/PHASE_1_STABILIZATION.md. Security: docs/SECURITY_REVIEW.md.
Setup: README.md. Reviewed screenshots: docs/images/.
