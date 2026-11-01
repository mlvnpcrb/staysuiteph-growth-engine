import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import {
  cadenceSchema,
  nextScheduleOccurrence,
  campaignJobSchema,
  scheduleSchema,
  type CampaignJob,
  type CampaignSchedule,
} from "@staysuite/validation";
const owner = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222",
  groupId = "33333333-3333-4333-8333-333333333333",
  jobId = "44444444-4444-4444-8444-444444444444",
  scheduleId = "55555555-5555-4555-8555-555555555555",
  actor = { actor_id: "12345", actor_type: "personal" };
let db: PGlite;
let job: CampaignJob;
let schedule: CampaignSchedule;
async function identity(id = owner, role = "authenticated") {
  await db.exec(`reset role;set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function cmd(
  operation: string,
  payload: unknown = {},
  id = scheduleId,
  revision: number | null = schedule?.revision ?? 1,
) {
  const result = await db.query<{ result: unknown }>(
    "select public.schedule_command($1,$2,$3,$4) result",
    [id, revision, operation, JSON.stringify(payload)],
  );
  return result.rows[0]!.result;
}
async function campaign(command: string, payload: unknown = {}) {
  const result = await db.query<{ job: unknown }>(
    "select public.campaign_command($1,$2,$3,$4) job",
    [jobId, job?.revision ?? 0, command, JSON.stringify(payload)],
  );
  job = campaignJobSchema.parse(result.rows[0]!.job);
  return job;
}
async function privileged(sql: string) {
  await db.exec(`reset role;${sql}`);
  await identity();
}
const files = [
  "20261022122018_saved_groups.sql",
  "20261023010000_optional_group_context.sql",
  "20261023020000_group_marketing_evidence.sql",
  "20261023110003_campaign_execution.sql",
  "20261023145846_campaign_management.sql",
  "20261023215918_campaign_live_validation.sql",
  "20261024083111_campaign_direct_publishing.sql",
  "20261101144558_campaign_schedules.sql",
];
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt()returns jsonb language sql stable as $$select '{}'::jsonb$$;grant usage on schema public,auth to authenticated,anon;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,update on storage.objects to authenticated;`,
  );
  for (const file of files)
    await db.exec(
      await readFile(
        new URL(`../../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
}, 30000);
beforeEach(async () => {
  await db.exec(
    `reset role;truncate public.campaign_schedules,public.campaign_schedule_runs,public.campaign_targets,public.campaign_media,public.campaign_jobs,public.saved_groups cascade;update public.campaign_publishers set enabled=false,verified_at=null;insert into public.saved_groups(id,user_id,identity,url,title,destination,accommodation,audience,review_status,rule_evidence,last_reviewed_at,marketing_evidence)values('${groupId}','${owner}','98765','https://www.facebook.com/groups/98765/','Fixture','','','','reviewed','Fixture permission',now(),jsonb_build_object('observed_at',now(),'source_url','https://www.facebook.com/groups/98765/','promotion_allowed',true));`,
  );
  await identity();
  job = campaignJobSchema.parse(
    (
      await db.query<{ job: unknown }>(
        "select public.campaign_command($1,0,'create',$2) job",
        [
          jobId,
          JSON.stringify({
            ...actor,
            title: "Scheduled fixture",
            plan: {
              version: 1,
              text: "Fixture body",
              intervalMinutes: 1,
              groupIds: [groupId],
              media: [],
            },
            settings: { method: "direct", avoidNight: false },
          }),
        ],
      )
    ).rows[0]!.job,
  );
  await campaign("approve", { digest: job.digest });
  const start = new Date(Date.now() + 3600000).toISOString();
  schedule = scheduleSchema.parse(
    await cmd(
      "create",
      {
        campaign_id: jobId,
        cadence: cadenceSchema.parse({ frequency: "daily", starts_at: start }),
      },
      scheduleId,
      job.revision,
    ),
  );
});
afterAll(async () => {
  await db?.close();
});
it("persists private schedules and rejects anonymous, cross-owner and direct writes", async () => {
  expect(
    (await db.query("select id from public.campaign_schedules")).rows,
  ).toEqual([{ id: scheduleId }]);
  await expect(
    db.exec("update public.campaign_schedules set state='enabled'"),
  ).rejects.toMatchObject({ code: "42501" });
  await identity(other);
  expect(
    (await db.query("select * from public.campaign_schedules")).rows,
  ).toEqual([]);
  await expect(cmd("delete")).rejects.toMatchObject({ code: "42501" });
  await identity("", "anon");
  await expect(cmd("tick", actor)).rejects.toMatchObject({ code: "42501" });
});
it("requires current revisions including NULL and schedule review", async () => {
  await expect(cmd("pause", {}, scheduleId, null)).rejects.toMatchObject({
    code: "PT409",
  });
  await expect(cmd("enable", {})).rejects.toMatchObject({ code: "22023" });
  schedule = scheduleSchema.parse(await cmd("enable", { reviewed: true }));
  expect(schedule.state).toBe("enabled");
  await expect(
    cmd("pause", {}, scheduleId, schedule.revision - 1),
  ).rejects.toMatchObject({ code: "PT409" });
});
it("gates early manual starts without reserving actor-wide future cooldown", async () => {
  schedule = scheduleSchema.parse(await cmd("enable", { reviewed: true }));
  await expect(campaign("start", actor)).rejects.toMatchObject({
    code: "55000",
  });
  expect(await cmd("tick", actor)).toEqual({ campaign_ids: [] });
  expect(Date.parse(job.next_eligible_at)).toBeLessThan(
    Date.parse(schedule.next_run_at!),
  );
  expect(
    (await db.query("select id from public.campaign_schedule_runs")).rows,
  ).toHaveLength(0);
});
it("does not bypass disabled publisher gates or replay uncertain outcomes", async () => {
  schedule = scheduleSchema.parse(await cmd("enable", { reviewed: true }));
  await privileged(
    "update public.campaign_schedules set next_run_at=now()-interval '1 second'",
  );
  expect(await cmd("tick", actor)).toEqual({ campaign_ids: [] });
  expect(
    (
      await db.query<{ state: string }>(
        "select state from public.campaign_schedules",
      )
    ).rows[0]!.state,
  ).toBe("blocked");
  expect(
    (await db.query("select id from public.campaign_schedule_runs")).rows,
  ).toHaveLength(0);
});
it("dispatches once, archives receipts, projects the next run and preserves history on deletion", async () => {
  await privileged(
    "update public.campaign_publishers set enabled=true,verified_at=now() where method='direct'",
  );
  schedule = scheduleSchema.parse(await cmd("enable", { reviewed: true }));
  await privileged(
    "update public.campaign_schedules set next_run_at=now()-interval '1 second'",
  );
  expect(await cmd("tick", actor)).toEqual({ campaign_ids: [jobId] });
  expect(await cmd("tick", actor)).toEqual({ campaign_ids: [jobId] });
  expect(
    (await db.query("select id from public.campaign_schedule_runs")).rows,
  ).toHaveLength(1);
  await campaign("inspect");
  await campaign("claim", actor);
  await campaign("report", {
    attempt_token: job.targets[0]!.attempt_token,
    outcome: "live",
    post_url: "https://www.facebook.com/groups/98765/posts/123/",
    provider_code: "direct_story_receipt",
  });
  expect(job.state).toBe("completed");
  await cmd("tick", actor);
  schedule = scheduleSchema.parse(
    (await db.query<{row:unknown}>("select to_jsonb(s) row from public.campaign_schedules s")).rows[0]!.row,
  );
  expect(schedule.current_run_id).toBeNull();
  expect(Date.parse(schedule.next_run_at!)).toBeGreaterThan(Date.now());
  const rows = (
    await db.query<{ state: string; outcomes: { post_url: string }[] }>(
      "select state,outcomes from public.campaign_schedule_runs",
    )
  ).rows;
  expect(rows[0]!.state).toBe("completed");
  expect(rows[0]!.outcomes[0]!.post_url).toContain("/posts/123/");
  await cmd("delete");
  expect(
    (await db.query("select schedule_id from public.campaign_schedule_runs"))
      .rows,
  ).toEqual([{ schedule_id: null }]);
});
it("skips missed cycles, never catches up with a burst", async () => {
  schedule = scheduleSchema.parse(await cmd("enable", { reviewed: true }));
  await privileged(
    "update public.campaign_schedules set next_run_at=now()-interval '2 hours'",
  );
  expect(await cmd("tick", actor)).toEqual({ campaign_ids: [] });
  expect(
    (await db.query("select state from public.campaign_schedule_runs")).rows,
  ).toEqual([{ state: "missed" }]);
  expect(await cmd("tick", actor)).toEqual({ campaign_ids: [] });
});
it("blocks stale group approvals instead of dispatching", async () => {
  schedule = scheduleSchema.parse(await cmd("enable", { reviewed: true }));
  await privileged(
    "update public.saved_groups set rule_evidence='Changed rules',updated_at=now()",
  );
  expect(await cmd("tick", actor)).toEqual({ campaign_ids: [] });
  expect(
    (await db.query("select state from public.campaign_schedules")).rows,
  ).toEqual([{ state: "blocked" }]);
});
it.each([
  { frequency: "daily", weekdays: [], month_days: [], interval: 2 },
  { frequency: "weekly", weekdays: [0, 2, 5], month_days: [], interval: 3 },
  { frequency: "monthly", weekdays: [], month_days: [29, 31], interval: 1 },
])("SQL and TypeScript recurrence agree for $frequency", async (extra) => {
  const c = cadenceSchema.parse({
    starts_at: "2028-01-31T16:00:00Z",
    ends_at: null,
    ...extra,
  });
  let cursor = "2028-01-01T00:00:00Z";
  for (let n = 0; n < 8; n++) {
    const expected = nextScheduleOccurrence(c, cursor);
    const row = await db.query<{ at: string | null }>(
      "select public.schedule_next($1,$2)::text at",
      [JSON.stringify(c), cursor],
    );
    const actual = row.rows[0]!.at;
    expect(actual ? new Date(actual).toISOString() : null).toBe(expected);
    if (!expected) break;
    cursor = expected;
  }
});
