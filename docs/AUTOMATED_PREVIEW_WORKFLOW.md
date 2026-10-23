# Verified Preview automation

The deletion request is paused. No resources are deleted by this workflow.

## Routine operation

A push to `feat/phase-2-group-finder` runs frozen installation, lint, typechecks,
unit/script tests, both builds, browser tests, native extension tests and isolated
Supabase database/auth tests. Only when the existing `validate` gate succeeds does
the new Preview job run. Pull requests run checks but cannot execute the deployment
job or receive its credentials. Production is never requested or promoted.

The job verifies Vercel project/repository identity, root `apps/web`, and that the
feature branch is not the configured Production branch. It deploys the exact tested
Git SHA, waits for Ready, verifies that SHA, and checks the login page. Failure,
timeout, deployment protection or missing configuration fails the job. The GitHub
Actions summary contains the immutable Preview URL only after successful smoke.
No Google credentials, sessions, tokens or error response bodies are logged.

This is a login-page smoke test, not proof of Google OAuth, database persistence,
session refresh or live Facebook compatibility. Existing Google login is unchanged.
The existing responsive fixture tests still run independently of the hosted smoke.

## One-time activation (account access required)

Create GitHub Environment `preview` and restrict its deployment branches to this
feature branch. Configure these environment secrets/variables securely:

| Kind | Name | Purpose |
| --- | --- | --- |
| Secret | VERCEL_TOKEN | Account-authorized access to the existing Vercel project |
| Variable | VERCEL_PROJECT_ID | Existing project ID; not its display name |
| Variable | VERCEL_TEAM_ID | Existing team ID |
| Secret, if protected | VERCEL_AUTOMATION_BYPASS_SECRET | Vercel automation access for the login smoke; do not disable protection |

Retain existing Preview Supabase URL/publishable key, demo mode=false and OAuth
system-variable configuration. Never enter service-role credentials in public
variables. No new application key is needed. Verify Vercel's Production branch
before enabling this job; missing branch metadata fails closed.

Vercel's current native Git integration can independently produce a Preview before
checks complete. This workflow does not secretly disable or alter it. To have only
the checked deployment, configure Vercel's Git deployment behavior for this feature
branch after inspecting the current settings. Do not disable Production deployments
or project-wide integration blindly. Until then, duplicate Preview builds may occur;
the URL in this workflow's successful summary is the tested-commit deployment.

## Database approval boundary

No hosted migration command is included. The live migration history was previously
absent, so an automatic `db push` could rerun existing migrations or the parked
owner-only work. That is explicitly prohibited. See GROUP_MARKETING_RANKING.md for
the two pending Phase 2 migration files and ordering. The user's approval to apply
these is recorded in the conversation, but target/schema verification and actual
database access are still prerequisites. Preserve profiles, Auth, current RLS and
the parked owner-only migration.

After access is restored: inspect target and schema read-only, apply only missing
approved SQL transactionally, verify constraints/grants/RLS and saved-group
persistence, then record results. Establish official CLI migration-history
reconciliation separately before introducing a gated migration workflow. Future
destructive changes require explicit approval and a protected GitHub Environment
with a required reviewer; do not assume writing an environment name enables review.

## Current evidence and limitations

The deployment script is exercised with mocked platform responses, including wrong
project/root/branch, Production targets, mismatched commits, failed builds, protected
login, incomplete configuration and timeout. These are not live deployment results.
This session can push Git but Vercel/GitHub APIs are denied and Supabase tools are
unavailable. Environment secret provisioning, hosted deployment and an end-to-end
harmless rollout remain NOT VERIFIED. The pipeline is prepared, not operationally
proven. Once account access is available, use one documentation-only commit to prove
the complete path and record the actual URL/check results before claiming automation.

Local validation on 23 October 2026 (Asia/Manila): frozen installation, lint,
typechecks, builds/MV3 verification and workflow YAML parsing passed. All 182
Vitest tests, 9 Node script tests (191 total), and 84 responsive Playwright tests
passed. Native extension loading is BLOCKED by Chrome administrator policy.
`pnpm db:test` is BLOCKED: local Supabase PostgreSQL at 127.0.0.1:54322 is not
running. The live deploy script fails closed with missing VERCEL_TOKEN. Build
results reused unchanged application task caches; the pipeline itself is tested
by the new script tests, not by those cached application builds.

## Isolated CI registry selection

The database job sets SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io. The pinned CLI
2.75.0's GetRegistry/GetRegistryImageUrl implementation supports this original
registry selection; its public.ecr.aws default repeatedly failed CI image pulls
with rate-limit annotations. This changes only image acquisition for the isolated
runner. Database, auth/persistence, validation and Preview smoke gates still run.
No live database configuration or migration is changed.

Reference: https://github.com/supabase/cli/blob/v2.75.0/internal/utils/docker.go
and cmd/root.go (SUPABASE env prefix / INTERNAL_IMAGE_REGISTRY).
