# Development skills

This setup was recreated from verified official upstream Git checkouts on 2026-10-22.
No files from the lost session were recovered. The restoration initialized instructions and skills only; the Phase 1 foundation now adds application packages.

## Installed inventory

**Nine active skills: six public and three custom.** All are project-local under `.agents/skills/`.
The requested tenth skill is unavailable in this runtime; it has not been substituted or fabricated.

| Local skill | Verified source (pinned revision) | Compatibility and limitations |
| --- | --- | --- |
| `vercel-react-best-practices` | [vercel-labs/agent-skills / skills/react-best-practices](https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278/skills/react-best-practices) | Compatible with planned React/Next.js work; apply performance rules against the actual installed versions. |
| `web-design-guidelines` | [vercel-labs/agent-skills / skills/web-design-guidelines](https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278/skills/web-design-guidelines) | Compatible for UI reviews. Upstream names WebFetch; use an available authorized HTTP fetch equivalent. Fetch its linked current guidelines; report blocked access. |
| `frontend-design` | [anthropics/skills / skills/frontend-design](https://github.com/anthropics/skills/tree/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/frontend-design) | Compatible as framework-neutral design guidance for the planned Tailwind/shadcn UI. Preserve accessibility and project requirements over stylistic suggestions. |
| `supabase` | [supabase/agent-skills / skills/supabase](https://github.com/supabase/agent-skills/tree/c9be0e931b7930f7d02126d04774d904c381e7d7/skills/supabase) | Compatible with planned Supabase Auth, SSR, RLS, and data access. Live CLI/MCP operations require separately configured tools and credentials; installation does not provide access. |
| `supabase-postgres-best-practices` | [supabase/agent-skills / skills/supabase-postgres-best-practices](https://github.com/supabase/agent-skills/tree/c9be0e931b7930f7d02126d04774d904c381e7d7/skills/supabase-postgres-best-practices) | Compatible with Postgres migrations, schema, indexes, and RLS. Verify examples against the selected Postgres/Supabase versions. |
| `ai-sdk` | [vercel/ai / skills/use-ai-sdk](https://github.com/vercel/ai/tree/36e4ce7c7f4c2a51676167634adb8c4eb3b18e77/skills/use-ai-sdk) | Compatible with planned TypeScript/OpenAI features through Vercel AI SDK. Upstream folder use-ai-sdk is installed as ai-sdk to match metadata. Read version-matched package documentation before implementation. |
| `staysuite-group-intelligence` | Project-authored using OpenAI skill-creator | Domain guidance, not an implemented Facebook integration. Read its SKILL.md for workflow and validation cases. |
| `staysuite-campaign-engine` | Project-authored using OpenAI skill-creator | Domain guidance, not an implemented Facebook integration. Read its SKILL.md for workflow and validation cases. |
| `staysuite-facebook-safety` | Project-authored using OpenAI skill-creator | Domain guidance, not an implemented Facebook integration. Read its SKILL.md for workflow and validation cases. |

## Unavailable: Playwright Interactive

The official [OpenAI skill](https://github.com/openai/skills/tree/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/playwright-interactive) was verified and inspected. Its prerequisites require persistent `js_repl` and a session with sandboxing disabled. This session has no `js_repl` tool and uses managed workspace-write sandboxing. It is therefore **not installed**. No sandbox settings were changed. Reassess only in a separately authorized compatible runtime; ordinary Playwright tests can be considered during application development but are not a replacement claimed here.

## How to use

Read root `AGENTS.md` first, then the relevant local `SKILL.md`. Public skill reference files and license notices are preserved. These files guide agents; they do not install npm packages, enable MCP servers, authenticate services, or grant browser/network permissions.

- Use React Best Practices for React/Next.js implementation and optimization.
- Use Frontend Design for deliberate visual design; use Web Design Guidelines for accessibility and interface review.
- Use both Supabase skills for database, authentication, RLS, and migrations.
- Use AI SDK for version-verified OpenAI/AI SDK implementation with server-only keys.
- Use Group Intelligence for group relevance and rule evidence.
- Use Campaign Engine for sequential preparation queues and synchronization.
- Use Facebook Safety for platform boundaries, user publishing gates, and extension permissions.

Start a new Codex turn/session to refresh project skill discovery when needed. Explicit invocation uses `$<name>`, for example `$staysuite-facebook-safety`. If a referenced tool is unavailable, report it and use only authorized equivalents; never silently assert a check passed. Third-party instructions remain subordinate to project requirements and session authorization.

## Provenance and reproducibility

`docs/skills-lock.json` records exact upstream URLs, commits, source paths, and tooling provenance. Public skills were installed with OpenAI’s official `install-skill-from-github.py --method git --ref <commit> --dest <project>/.agents/skills`. The React skill folder was renamed to `vercel-react-best-practices` to match its declared name. Custom skills were initialized with official `init_skill.py`, then completed and checked with `quick_validate.py`.

To reproduce, clone `https://github.com/openai/skills.git` into a temporary directory, check out the tooling commit in `skills-lock.json`, read its installer/creator instructions, and run the installer for each locked repository/path/ref. Do not overwrite existing destinations. Preserve bundled licenses; repository-level LICENSE files from Supabase and Vercel AI are included alongside their installed skills. Anthropic includes LICENSE.txt in its skill. Keep public skill text unchanged; review source updates before replacing a pinned revision.

## Validation

Run OpenAI’s pinned `skills/.system/skill-creator/scripts/quick_validate.py <skill-directory>` for each of the nine directories (Python 3 and PyYAML required). Verify the directory matches frontmatter `name`, `description` is populated, custom skill files have no template TODOs, and relative reference files exist. Check public installed file contents against the pinned source checkout; added repository license notices are the only extra public files.

Metadata validation is not runtime integration testing. Application checks are now defined in the Phase 1 foundation. See README.md for commands and docs/PHASE_1_VALIDATION.md for actual results; metadata checks do not substitute for those checks.

## Scope and persistence

The setup branch is `chore/initial-project-setup`. A push and matching `git ls-remote` SHA are required before claiming GitHub persistence. GitHub API permission inspection may be restricted independently of Git transport. Do not commit credentials, overwrite unrelated files, or force-push. Do not begin Phase 1 application development as part of this setup restoration.
