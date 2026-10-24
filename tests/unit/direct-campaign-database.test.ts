import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { campaignJobSchema } from "@staysuite/validation";
it("Direct validation is method/version/owner scoped and holds sequential work until confirmed", async () => {
    const db = new PGlite();
    const owner = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222", id = "55555555-5555-4555-8555-555555555555";
    const groups = ["33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"];
    try {
        await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt()returns jsonb language sql stable as $$select '{}'::jsonb$$;grant usage on schema public,auth to authenticated,anon;insert into auth.users values('${owner}'),('${other}');create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,update on storage.objects to authenticated;`);
        for (const file of ["20261022122018_saved_groups.sql", "20261023010000_optional_group_context.sql", "20261023020000_group_marketing_evidence.sql", "20261023110003_campaign_execution.sql", "20261023145846_campaign_management.sql", "20261023215918_campaign_live_validation.sql", "20261024083111_campaign_direct_publishing.sql"])
            await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), "utf8"));
        for (const [i, g] of groups.entries())
            await db.query(`insert into public.saved_groups(id,user_id,identity,url,title,destination,accommodation,audience,review_status,rule_evidence,last_reviewed_at,marketing_evidence)values($1::uuid,$2::uuid,split_part($3::text,'/',5),$3::text,'Fixture','','','','reviewed','Fixture permission',now(),jsonb_build_object('observed_at',now(),'source_url',$3::text,'promotion_allowed',true))`, [g, owner, `https://www.facebook.com/groups/${98765 + i}/`]);
        await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false)`);
        let revision = 0;
        async function cmd(command: string, payload: unknown = {}) {
            const q = await db.query<{
                job: unknown;
            }>("select public.campaign_command($1,$2,$3,$4::jsonb) job", [id, revision, command, JSON.stringify(payload)]);
            const job = campaignJobSchema.parse(q.rows[0]!.job);
            revision = job.revision;
            return job;
        }
        async function ready(method = "direct") { return (await db.query<{
            ready: boolean;
        }>(`select public.campaign_${method === "direct" ? "direct_" : ""}publisher_ready('12345') ready`)).rows[0]!.ready; }
        let job = await cmd("create", { actor_id: "12345", actor_type: "personal", title: "Direct fixture", plan: { version: 1, text: "Fixture offer", intervalMinutes: 2, groupIds: groups, media: [] }, settings: { method: "direct", avoidNight: false } });
        job = await cmd("approve", { digest: job.digest });
        await expect(cmd("start", { actor_id: "12345", actor_type: "personal" })).rejects.toMatchObject({ code: "55000" });
        const payload = { actor_id: "12345", reviewed: true, adapter_version: "0.4.0", digest: job.digest, target_id: job.targets[0]!.id };
        await expect(cmd("validate_one", { ...payload, adapter_version: "0.3.2" })).rejects.toMatchObject({ code: "22023" });
        job = await cmd("validate_one", payload);
        expect(job.targets[0]!.state).toBe("claimed");
        expect(job.targets[1]!.state).toBe("queued");
        job = await cmd("report", { attempt_token: job.targets[0]!.attempt_token, outcome: "pending_admin", post_url: "https://www.facebook.com/groups/98765/posts/123/", provider_code: "direct_story_receipt" });
        expect(job.state).toBe("paused");
        expect(await ready()).toBe(false);
        await db.exec(`select set_config('request.jwt.claim.sub','${other}',false)`);
        await expect(cmd("confirm_validation", { ...payload, post_url: job.targets[0]!.post_url })).rejects.toMatchObject({ code: "42501" });
        await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false)`);
        job = await cmd("confirm_validation", { ...payload, post_url: job.targets[0]!.post_url });
        expect(await ready()).toBe(true);
        expect(await ready("classic")).toBe(false);
        expect(job.state).toBe("paused");
        job = await cmd("start", { actor_id: "12345", actor_type: "personal" });
        job = await cmd("claim", { actor_id: "12345", actor_type: "personal" });
        expect(job.targets[1]!.state).toBe("queued");
        // Isolated fixture only: advance eligibility rather than wait two real minutes.
        await db.exec(`reset role;update public.campaign_jobs set next_eligible_at=now()-interval '1 second';set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false)`);
        job = await cmd("claim", { actor_id: "12345", actor_type: "personal" });
        expect(job.targets[1]!.state).toBe("claimed");
        job = await cmd("report", { attempt_token: job.targets[1]!.attempt_token, outcome: "uncertain", provider_code: "direct_interrupted" });
        expect(job.state).toBe("blocked");
        expect(await ready()).toBe(false);
        await expect(db.exec("select * from staysuite_campaign_private.direct_actor_validations")).rejects.toMatchObject({ code: "42501" });
    }
    finally {
        await db.close();
    }
}, 30000);
