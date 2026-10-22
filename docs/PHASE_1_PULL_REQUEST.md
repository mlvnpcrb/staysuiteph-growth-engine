# Phase 1 foundation — final review and stabilization

The foundation now includes reviewed dependency fixes, stricter profile column grants,
fail-closed sync outage handling, explicit auth no-cache responses, truthful logout
failure handling, and mobile keyboard/contrast corrections. Next.js and Plasmo remain
on their original versions; a committed parser Map adapter accompanies the CSP update.
The extension has an explicit CSP and still requests no Facebook/host permissions.

Local validation: frozen install, lint, strict typecheck, both production builds and
manifest verification passed. **38 unit/PostgreSQL tests and 39 desktop/tablet/mobile
browser checks passed**, including mocked auth/API boundaries, popup browser harness,
and light/dark automated accessibility scans. A real Plasmo dev build verified CSP
adapter behavior.

Audit: **0 critical, 1 high, 8 moderate, 1 low**, reduced from 9/11/2. The remaining high
is an unpatched braces glob-parser finding also installed through optional Next/Sass;
no app request route to it was found. Retained Plasmo dev-tool advisories and exact
paths/mitigations are documented in docs/SECURITY_REVIEW.md, with machine-readable snapshots.
The audit is not clean and does not imply production security approval.

Original CI failed at Playwright browser installation, after all earlier checks passed.
No source conflict was found. CI now pins Ubuntu 24.04 and separates quality/browser/DB
jobs while preserving an aggregate validate gate requiring every job to succeed. This
must be confirmed by a green remote run; no protections or required reviews were bypassed.

Limitations: full local Supabase startup/pgTAP is blocked by container-registry HTTP 403;
no live Auth credentials are configured. Native extension installation is blocked by
Chromium administrator policy. The popup HTTP harness is not installed-extension or
pairing verification. Branch protection/review state and PR edits are blocked by GitHub
API Forbidden responses from this environment.

**Recommendation: Needs More Work before merge signoff.** Run current remote CI, verify
required reviews/protections, complete real Supabase and supported native-extension tests,
and review remaining dependency risks. No automatic merge, Phase 2, or Facebook automation.

Details: docs/PHASE_1_STABILIZATION.md. Setup: README.md. Screenshots: docs/images/.
