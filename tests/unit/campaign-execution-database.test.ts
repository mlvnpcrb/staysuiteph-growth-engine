import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const owner = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
it("transactional campaign commands isolate owners and fail closed before publishing", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;alter default privileges in schema public grant all on tables to authenticated,anon;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt()returns jsonb language sql stable as $$select '{}'::jsonb$$;grant usage on schema public,auth to authenticated,anon;insert into auth.users values('${owner}'),('${other}');create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,update on storage.objects to authenticated;`,
    );
    for (const file of [
      "20261022122018_saved_groups.sql",
      "20261023010000_optional_group_context.sql",
      "20261023020000_group_marketing_evidence.sql",
      "20261023110003_campaign_execution.sql",
    ])
      await db.exec(
        await readFile(
          new URL(`../../supabase/migrations/${file}`, import.meta.url),
          "utf8",
        ),
      );
    const groupIds = [
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
    ];
    for (const id of groupIds)
      await db.query(
        `insert into public.saved_groups(id,user_id,identity,url,title,destination,accommodation,audience,review_status,rule_evidence,last_reviewed_at,marketing_evidence)values($1::uuid,$2::uuid,$1::text,$3::text,'Fixture group','','','','reviewed','Fixture permission',now(),jsonb_build_object('observed_at',now(),'source_url',$3::text,'promotion_allowed',true))`,
        [id, owner, `https://www.facebook.com/groups/${id}/`],
      );
    const quiet = await db.query<{ wake: string }>(
      "select staysuite_campaign_private.quiet_until('2026-10-23T14:00:00Z')::text wake",
    );
    expect(Date.parse(quiet.rows[0]!.wake)).toBe(
      Date.parse("2026-10-23T23:00:00Z"),
    );
    const morning = await db.query<{ wake: string }>(
      "select staysuite_campaign_private.quiet_until('2026-10-23T23:00:00Z')::text wake",
    );
    expect(Date.parse(morning.rows[0]!.wake)).toBe(
      Date.parse("2026-10-23T23:00:00Z"),
    );
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`,
    );
    const id = "55555555-5555-4555-8555-555555555555";
    type Job = {
      id: string;
      revision: number;
      digest: string;
      state: string;
      next_eligible_at: string;
      targets: { id: string; state: string; attempt_token: string | null }[];
    };
    async function cmd(
      command: string,
      revision: number,
      payload: unknown = {},
      campaign = id,
    ): Promise<Job> {
      return (
        await db.query<{ result: Job }>(
          "select public.campaign_command($1,$2,$3,$4::jsonb) result",
          [campaign, revision, command, JSON.stringify(payload)],
        )
      ).rows[0]!.result;
    }
    const plan = {
      version: 1,
      text: "Fixture offer",
      intervalMinutes: 2,
      groupIds,
      media: [],
    };
    let job = await cmd("create", 0, {
      actor_id: "12345",
      actor_type: "personal",
      plan,
      settings: { avoidNight: false },
    });
    expect(job.state).toBe("draft");
    expect(job.targets).toHaveLength(2);
    await expect(
      cmd("approve", job.revision, { digest: "stale" }),
    ).rejects.toMatchObject({ code: "PT409" });
    job = await cmd("approve", job.revision, { digest: job.digest });
    expect(job.state).toBe("ready");
    await expect(
      cmd("start", job.revision, { actor_id: "12345", actor_type: "personal" }),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      db.exec("update public.campaign_publishers set enabled=true"),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.exec("update public.campaign_jobs set state='running'"),
    ).rejects.toMatchObject({ code: "42501" });
    await db.exec(
      `select set_config('request.jwt.claim.sub','${other}',false)`,
    );
    expect(
      (await db.query("select * from public.campaign_jobs")).rows,
    ).toHaveLength(0);
    await expect(cmd("cancel", job.revision)).rejects.toMatchObject({
      code: "42501",
    });
    await db.exec(
      `reset role;update public.campaign_publishers set enabled=true,verified_at=now() where method='classic';set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false)`,
    );
    await expect(
      cmd("start", job.revision, { actor_id: "999", actor_type: "personal" }),
    ).rejects.toMatchObject({ code: "42501" });
    const mediaJobId = "66666666-6666-4666-8666-666666666666";
    let mediaJob = await cmd(
      "create",
      0,
      {
        actor_id: "12345",
        actor_type: "personal",
        plan: {
          ...plan,
          media: [
            {
              name: "fixture.png",
              type: "image/png",
              size: 8,
              sha256: "a".repeat(64),
            },
          ],
        },
        settings: { avoidNight: false },
      },
      mediaJobId,
    );
    await expect(
      cmd(
        "approve",
        mediaJob.revision,
        { digest: mediaJob.digest },
        mediaJobId,
      ),
    ).rejects.toMatchObject({ code: "22023" });
    const reserved = await cmd(
      "reserve_media",
      mediaJob.revision,
      { position: 0 },
      mediaJobId,
    );
    const asset = (
      await db.query<{ id: string; object_path: string }>(
        "select id,object_path from public.campaign_media where campaign_id=$1",
        [mediaJobId],
      )
    ).rows[0]!;
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('campaign-media',$1,'{\"size\":8}')",
      [asset.object_path],
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','${other}',false)`,
    );
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      0,
    );
    await expect(
      db.query(
        "insert into storage.objects(bucket_id,name,metadata) values('campaign-media',$1,'{\"size\":8}')",
        [asset.object_path + "other"],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await db.exec(
      `select set_config('request.jwt.claim.sub','${owner}',false)`,
    );
    mediaJob = await cmd(
      "media_uploaded",
      reserved.revision,
      { asset_id: asset.id },
      mediaJobId,
    );
    mediaJob = await cmd(
      "approve",
      mediaJob.revision,
      { digest: mediaJob.digest },
      mediaJobId,
    );
    await db.query(
      "update storage.objects set metadata='{\"size\":999}' where name=$1",
      [asset.object_path],
    );
    expect(
      (
        await db.query<{ metadata: { size: number } }>(
          "select metadata from storage.objects where name=$1",
          [asset.object_path],
        )
      ).rows[0]!.metadata.size,
    ).toBe(8);
    await expect(
      cmd("reserve_media", mediaJob.revision, { position: 0 }, mediaJobId),
    ).rejects.toMatchObject({ code: "22023" });
    job = await cmd("start", job.revision, {
      actor_id: "12345",
      actor_type: "personal",
    });
    job = await cmd("claim", job.revision, {
      actor_id: "12345",
      actor_type: "personal",
    });
    expect(job.targets[0]!.state).toBe("claimed");
    const token = job.targets[0]!.attempt_token;
    await expect(
      cmd("claim", job.revision, { actor_id: "12345", actor_type: "personal" }),
    ).rejects.toMatchObject({ code: "55000" });
    job = await cmd("pause", job.revision);
    job = await cmd("report", 0, {
      attempt_token: token,
      outcome: "pending_admin",
      post_url: `https://www.facebook.com/groups/${groupIds[0]}/posts/123/`,
    });
    expect(job.state).toBe("paused");
    expect(job.targets[0]!.state).toBe("pending_admin");
    const repeat = await cmd("report", 0, {
      attempt_token: token,
      outcome: "live",
      post_url: `https://www.facebook.com/groups/${groupIds[0]}/posts/123/`,
    });
    expect(repeat.targets[0]!.state).toBe("pending_admin");
    job = await cmd("resume", job.revision, {
      actor_id: "12345",
      actor_type: "personal",
    });
    job = await cmd("claim", job.revision, {
      actor_id: "12345",
      actor_type: "personal",
    });
    expect(job.targets[1]!.state).toBe("queued");
    await db.exec(
      `reset role;update public.campaign_jobs set next_eligible_at=now()-interval '1 second';set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false)`,
    );
    job = await cmd("claim", job.revision, {
      actor_id: "12345",
      actor_type: "personal",
    });
    expect(job.targets[1]!.state).toBe("claimed");
    const reservedEligibility = job.next_eligible_at;
    expect(Date.parse(reservedEligibility)).toBeGreaterThan(Date.now() + 60_000);
    await db.exec(
      `reset role;update public.campaign_targets set lease_until=now()-interval '1 second' where state='claimed';set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false)`,
    );
    job = await cmd("recover", 0);
    expect(job.state).toBe("blocked");
    expect(job.targets[1]!.state).toBe("uncertain");
    job = await cmd("resolve", job.revision, {
      target_id: job.targets[1]!.id,
      reviewed: true,
      outcome: "not_sent",
    });
    expect(job.state).toBe("completed");
    expect(job.targets[1]!.state).toBe("not_sent");
    expect(job.next_eligible_at).toBe(reservedEligibility);
    await db.exec("reset role;set role anon");
    await expect(
      db.exec("select * from public.campaign_jobs"),
    ).rejects.toMatchObject({ code: "42501" });
  } finally {
    await db.close();
  }
}, 30000);
