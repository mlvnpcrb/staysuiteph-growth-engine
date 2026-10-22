# Phase 2 — AI Facebook Group Finder

## Outcome

Help a Philippine accommodation host find relevant Facebook Groups, understand why each
candidate fits, and save a useful shortlist. Deliver working Group Finder, My Groups and
Overview features inside the existing dashboard design. Do not expand into posting,
campaigns, lead collection or extension automation.

## Working Preview freeze and development baseline

Leave the working Preview deployment, OAuth, auth environment/provider settings and existing
profile policies unchanged. Do not apply the pending owner-only migration, atomic apply or
recovery SQL, or migration-history repair. Their local files remain parked and intact.
The owner-only work is unshipped and is not a Phase 2 prerequisite or a live security claim.

Before implementation, identify the actual deployed working commit, then create a separate
Phase 2 feature branch/worktree from that exact baseline. Do not assume local feature HEAD
is the deployed version: local history includes unshipped owner-authorization changes.
Do not reset, delete or overwrite existing work. Keep Phase 2 local until deployment is
separately authorized. Avoid pushing to the existing Preview's connected branch because a
push can trigger an automatic deployment. No Vercel setting changes are part of this plan.

## First usable workflow

1. Enter a destination (for example Cebu City), accommodation type and intended audience
   (hosts or guests), with optional English/Filipino search preferences.
2. Search publicly indexed Facebook Group links using a supported web-search provider,
   alongside AI-assisted search phrases. A provider adapter must be verified against its
   current documentation and permitted uses; no provider capability is assumed installed.
3. View real candidate cards: group title/link, source snippet, location/audience evidence,
   match explanation and confidence. Unknown facts remain unknown. Public search snippets
   are discovery leads, not proof of access, membership, activity or current group rules.
4. Filter/sort by destination, audience, relevance and saved status. Open the group in
   Facebook in a new tab for personal review. Search results may be incomplete or stale.
5. Save or dismiss candidates; see duplicate feedback. Add a real group URL manually when
   search coverage is poor. Never create a convincing list of fictional search results.
6. In My Groups, add private notes, record personally reviewed rule excerpts/source/date,
   and mark review status. Unknown/stale rules stay review_required, separate from relevance.
7. Overview reflects actual saved groups and outstanding reviews, without invented growth,
   booking, reach or activity metrics.

If a supported public-search provider/key is unavailable, offer generated query suggestions,
user-opened Facebook/web search links and manual group entry with a clear search-unavailable
state. This is a usable fallback, not a claim that automatic discovery is connected.
Real indexed discovery remains a milestone and its provider configuration is a dependency.

## Delivery slices

### A. Functional dashboard workflow

Implement the search form, URL-synchronized filters, candidate cards, details panel and
save/dismiss controls. Add My Groups list/detail/notes and meaningful empty, loading, error,
retry, no-results and duplicate states. Preserve navy/teal styling, themes, keyboard access
and desktop/tablet/mobile layouts. Development fixtures must be explicitly labeled and
kept separate from real source-backed results.

### B. Trusted sources and saved groups

Add a normalized candidate model and public-search adapter with bounded queries/results,
timeouts, URL validation and deduplication by canonical identity rather than display name.
Accept user-supplied links/text as a separate source. Do not fetch Facebook pages server-side,
scrape private groups, harvest members, collect Facebook cookies/tokens or add host permissions.
Do not follow arbitrary user-provided URLs server-side; use validated links for user navigation.

Propose new user-scoped tables for saved_groups and group_rule_reviews. Save canonical URL,
stable identity where available, title, location/audience evidence, source reference,
observed_at, private notes and created/updated timestamps. Rule reviews retain exact user-
supplied excerpts, reviewer identity/time and review status; missing evidence never means
posting is allowed. Keep scores and extracted facts distinguishable from user-confirmed facts.

Prepare new migrations and isolation tests locally. Existing profiles and RLS remain intact;
no dependency on the pending owner registry. Every new table uses ownership-based RLS and
least-privilege grants. Persist only needed results, not member data or full provider responses.
Live schema application requires separate approval. Until then use isolated local storage/
database fixtures transparently; never claim hosted persistence has been deployed.

### C. AI assistance with evidence

Use a server-only OpenAI integration through version-verified AI SDK APIs. First inspect the
installed packages/docs; add pinned dependencies only during implementation. Keep keys out
of browser/extension bundles and do not change Auth configuration.

AI generates search phrases and produces schema-validated assessments of actual candidates:
location fit, accommodation/audience fit, cited input evidence, explanation, confidence and
unknowns. It must not invent URLs, member counts, activity, rules or posting eligibility.
Treat search snippets and user text as untrusted data, never instructions. Do not send
private notes or personal information unless needed and explicitly disclosed in the feature.

Use transparent scoring criteria and version them. A relevance score does not certify
posting eligibility. Add request/result limits, bounded token budgets, usage accounting,
repeat-request caching scoped appropriately, cancellation and graceful provider failures.
Manual save/review remains usable when AI is unavailable. Select a current model from
verified provider documentation at implementation time rather than hardcoding a guessed ID.

### D. Acceptance and release review

Run installation, lint, typecheck, unit/SQL tests, dashboard and extension builds, and browser
checks. Demonstrate the complete search → assess → save → review → revisit flow locally.
No public deployment, merge of PR #1, change to working Preview, or Auth changes are included.

## Existing architecture mapping

| Area | Responsibility |
| --- | --- |
| apps/web Group Finder route/components | Search form, results, filters, details and state handling |
| apps/web My Groups route/components | Saved list, notes and rule-review interactions |
| apps/web Overview | Real saved/review counts with links to next actions |
| apps/web server modules/actions | Existing verified-session authorization, validated search/save/review operations, provider calls and bounded usage |
| packages/types | Candidate, source/evidence, assessment and saved-group contracts |
| packages/validation | Search input, Facebook group URL, save/review and structured AI result schemas |
| packages/database | User-scoped data access using current authenticated sessions and RLS |
| packages/ui | Reusable controls only where they are useful beyond a single feature |
| supabase/migrations and tests | New group tables, grants, RLS and isolated authorization tests; no live execution |
| apps/extension | Unchanged in this phase; no pairing or Facebook automation prerequisite |

Keep provider-specific code behind adapters. Never trust caller-supplied user_id; derive it
from the existing server-verified Supabase identity. Authorize each new action/data operation
independently without editing the working authentication system. Existing per-user RLS
isolates data; this plan does not claim the frozen deployment enforces global owner-only access.

## Acceptance criteria

- A supported configured search adapter returns real source-backed group links; unavailable
  search produces an honest fallback, not fabricated results.
- Duplicate variants of the same canonical group cannot create duplicate saved records for
  one user. Saving is idempotent, including repeated requests.
- Search filters, details, save/dismiss, notes and rule reviews work with accessible feedback.
- Saved groups persist/reload in the configured test environment. Overview counts come from
  that same data. Hosted persistence is not claimed until its separately approved rollout.
- AI output validates against schemas, cites candidate evidence and preserves unknowns;
  malicious snippets cannot trigger instructions, credential access or arbitrary fetching.
- Anonymous and cross-user access to new actions/data is denied; forged ownership, unsafe
  links, invalid inputs and unauthorized writes are covered by tests.
- Provider timeout/error/empty responses, token/cost bounds and non-AI fallback are tested.
- Desktop/tablet/mobile tests cover search → save → review, keyboard access and both themes.
- No existing Google login flow, callback/session mechanism or profile policy is changed.

## Immediate implementation priority

Build a single vertical slice first: destination search → real candidate or honest search
fallback → save → My Groups → real Overview count. Then add AI explanations and rule-review
polish. Keep other navigation sections as clearly labeled future features. Before a hosted
rollout, report source-provider/key readiness and required new-table migrations separately.

This document is a plan only. No Phase 2 application code, dependencies, migrations, provider
configuration or live changes were made while preparing it.
