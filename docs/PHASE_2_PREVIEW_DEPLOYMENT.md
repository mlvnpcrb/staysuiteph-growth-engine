# Phase 2 Preview — deployment instructions

Decision: **GO for an approved, controlled Preview rollout**, based on the previously
verified live profile schema and isolated tests. A fresh live object-collision check is
still required; no authenticated hosted schema inspection was available in this review.
Nothing below was executed live.

## Migration

Only apply `supabase/migrations/20261022122018_saved_groups.sql` to project
`kqjqcahysbmsaxlaipub`. It adds one table (`saved_groups`), primary/unique/activity indexes,
four owner-scoped policies, column-specific grants, and an invoker timestamp trigger/helper.
Existing profile data/grants/policies and Auth identities are preserved in isolated tests.
The pending owner-only migration is absent from this branch and must remain unapplied.

After live-SQL approval, open that project's SQL Editor. First run this read-only check:

```sql
select to_regclass('public.saved_groups') as saved_groups,
       to_regprocedure('public.touch_saved_group()') as timestamp_helper;
```

Both must be NULL. If either exists, stop and inspect; do not drop anything or rerun blindly.
Then submit **one request** containing `BEGIN;`, the entire exact new migration file, and
`COMMIT;`. Do not execute the original profile migrations, db push, reset, owner-only SQL,
or migration-history repair. On error, stop/roll back the failed transaction in the same
connection and inspect state before retrying. Duplicate application intentionally fails
instead of concealing existing objects; isolated rollback tests preserve saved/profile data.

After success, confirm forced/enabled RLS and the four saved_groups ownership policies.
Existing Google authentication/profile objects must remain unchanged. Hosted save/read/
notes/review/remove verification happens with the existing Google session after Preview
is deployed; it has not been claimed as tested yet.

## Vercel Preview configuration

Keep root `apps/web` and existing monorepo build setup. Scope these values to **Preview**
and the new branch `feat/phase-2-group-finder` (check branch overrides):

| Name | Value |
| --- | --- |
| STAYSUITE_DEMO_MODE | false |
| NEXT_PUBLIC_SUPABASE_URL | https://kqjqcahysbmsaxlaipub.supabase.co |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Existing publishable key from that project, configured privately |
| SITE_URL | Exact canonical **Phase 2 Preview branch origin**, HTTPS, no path/trailing slash |

No new OpenAI/search key, service-role key, database password, Google Client Secret or owner
UID variable is needed. STAYSUITE_OWNER_USER_ID is unused by this baseline; no need to edit
its existing configuration. Search links/manual entry and rule-based assessment are the
implemented honest fallback, not automatic Facebook discovery or live AI.

The new Preview URL cannot be asserted before a deployment is created. After an approved
push creates the new branch Preview, read its actual stable branch alias from Vercel,
configure SITE_URL to that exact origin, and redeploy **that Preview only** if necessary.
Use that canonical origin in the browser. Do not reuse the frozen Phase 1 origin, localhost,
or guess Vercel's truncated branch hostname. This avoids the existing origin-mismatch guard.
Its exact `<Phase 2 Preview origin>/auth/callback` must already be in Supabase's redirect
allowlist. If absent, adding only that entry (retaining existing entries/providers) needs
explicit approval; it is not an authentication code rewrite and was not performed here.

## Approval scope and browser test

Required authorization: apply only the new saved_groups migration after the target/object
checks; push only the Phase 2 branch; create/configure a **separate Phase 2 Preview** with
these environment values; and, if necessary, add only its callback URL to the redirect
allowlist. Keep the working Phase 1 Preview, Production, PR #1, Auth provider/secrets and
parked owner-only work untouched. No live migration-history repair is included.

Then test existing Google login → Group Finder search links → manually add a real group →
assess → save → reload My Groups → edit/clear notes → review rules → check Overview counts →
remove the test shortlist entry. Search/AI providers remain optional future additions.

Final preparation checks: frozen install, lint, typecheck and workspace builds/manifest
verification PASS (unchanged workspace tasks reused valid Turbo cache); **121 automated
checks PASS** (118 Vitest + 3 Node); **48 browser checks PASS**. Live persistence/OAuth on
the new Preview remains NOT VERIFIED. Real pgTAP still requires an available local
Supabase stack; the exact migration and role-based RLS ran in isolated PostgreSQL instead.
Branch ancestry is verified: Phase 2 starts directly at
`75fd080d150e99db5e2895edf27afccbdf7a1e77`; no owner-only commits are ancestors.
