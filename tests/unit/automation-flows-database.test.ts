import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import {
  automationFlowSchema,
  automationSnapshotSchema,
  campaignJobSchema,
  automationDefinitionSchema,
  automationPreparedReplySchema,
  type AutomationFlow,
  type CampaignJob,
} from "@staysuite/validation";
import { fileURLToPath } from "node:url";
const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const userC = "33333333-3333-4333-8333-333333333333";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    create schema storage;
    create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text, metadata jsonb);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select, insert, update on storage.objects to authenticated;
    grant usage on schema public, auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    insert into auth.users values ('${userA}'), ('${userB}'), ('${userC}');`);
  const directory = fileURLToPath(
    new URL("../../supabase/migrations/", import.meta.url),
  );
  for (const file of (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(`${directory}/${file}`, "utf8"));
  await db.exec(
    `insert into public.profiles (id, display_name) values ('${userA}', 'Host A'), ('${userB}', 'Host B')`,
  );
}, 30000);
const group = "66666666-6666-4666-8666-666666666666",
  jobId = "77777777-7777-4777-8777-777777777777",
  flowId = "88888888-8888-4888-8888-888888888888",
  trigger = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  postStep = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  wait = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  loop = "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  stop = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  actor = { actor_id: "12345", actor_type: "personal" };
const definition = () =>
  automationDefinitionSchema.parse({
    version: 1,
    steps: [
      { id: trigger, type: "trigger", cadence: null },
      { id: postStep, type: "post", campaign_ids: [jobId] },
      { id: wait, type: "wait", minutes: 1 },
      { id: loop, type: "loop", target_id: postStep, max_loops: 2 },
      { id: stop, type: "stop" },
    ],
  });
let flow: AutomationFlow, job: CampaignJob;
async function identity(id = userA) {
  await db.exec("reset role;set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function privileged(sql: string) {
  await db.exec("reset role");
  await db.exec(sql);
  await identity();
}
async function cmd(
  operation: string,
  payload: unknown = {},
  id = flowId,
  revision: number | null = flow?.revision ?? 0,
) {
  const result = (
    await db.query<{ result: { flow: unknown; deleted_id?: string } }>(
      "select public.automation_flow_command($1,$2,$3,$4) result",
      [id, revision, operation, JSON.stringify(payload)],
    )
  ).rows[0]!.result;
  if (result.flow) flow = automationFlowSchema.parse(result.flow);
  return result;
}
async function inspect() {
  flow = automationSnapshotSchema.parse(
    (
      await db.query<{ result: unknown }>(
        "select public.automation_flow_snapshot($1,false) result",
        [flowId],
      )
    ).rows[0]!.result,
  ).flows[0]!;
  return flow;
}
async function campaign(command: string, payload: unknown = {}) {
  job = campaignJobSchema.parse(
    (
      await db.query<{ result: unknown }>(
        "select public.campaign_command($1,$2,$3,$4) result",
        [
          jobId,
          command === "create" ? 0 : job.revision,
          command,
          JSON.stringify(payload),
        ],
      )
    ).rows[0]!.result,
  );
  return job;
}
async function tick() {
  const result = (
    await db.query<{ result: { campaign_ids: string[] } }>(
      "select public.schedule_command('00000000-0000-4000-8000-000000000000',0,'tick',$1) result",
      [JSON.stringify(actor)],
    )
  ).rows[0]!.result;
  await inspect();
  return result;
}
async function enable() {
  await inspect();
  await cmd("enable", { reviewed: true, digest: flow.digest, ...actor });
}
async function due() {
  await privileged(
    "update public.campaign_schedules set next_run_at=now()-interval '1 second' where automation_flow_id is not null;update public.campaign_jobs set next_eligible_at=now()-interval '1 second';",
  );
}
async function finish(outcome = "live") {
  await campaign("inspect");
  await campaign("claim", actor);
  expect(job.targets[0]?.attempt_token).toBeTruthy();
  await campaign("report", {
    attempt_token: job.targets[0]!.attempt_token,
    outcome,
    post_url:
      outcome === "live"
        ? "https://www.facebook.com/groups/12345/posts/123/"
        : "https://www.facebook.com/groups/12345/posts/124/",
    provider_code:
      outcome === "live" ? "direct_story_receipt" : "pending_admin",
  });
}
beforeEach(async () => {
  await db.exec(
    `reset role;truncate public.automation_flows,public.automation_flow_events,public.campaign_jobs,public.saved_groups,public.post_templates,storage.objects cascade;update public.campaign_publishers set enabled=true,verified_at=now() where method='direct';insert into public.saved_groups(id,user_id,identity,url,title,destination,accommodation,audience,review_status,rule_evidence,last_reviewed_at,marketing_evidence)values('${group}','${userA}','12345','https://www.facebook.com/groups/12345/','Fixture group','','','','reviewed','Owner-reviewed fixture',now(),jsonb_build_object('observed_at',now(),'source_url','https://www.facebook.com/groups/12345/','promotion_allowed',true));`,
  );
  await identity();
  await campaign("create", {
    ...actor,
    title: "Flow post",
    plan: {
      version: 1,
      text: "Fixture body",
      intervalMinutes: 1,
      groupIds: [group],
      media: [],
    },
    settings: { method: "direct", avoidNight: false },
  });
  await cmd(
    "create",
    { title: "Fixture flow", definition: definition() },
    flowId,
    0,
  );
});
afterAll(async () => {
  await db?.close();
});
it("validates graph shape and rejects forward or gapless loops in SQL and TypeScript", async () => {
  for (const altered of [
    { ...definition(), version: undefined },
    {
      ...definition(),
      steps: definition().steps.filter((step) => step.type !== "wait"),
    },
    {
      ...definition(),
      steps: definition().steps.map((step) =>
        step.type === "loop" ? { ...step, target_id: stop } : step,
      ),
    },
  ]) {
    expect(automationDefinitionSchema.safeParse(altered).success).toBe(false);
    expect(
      (
        await db.query<{ valid: boolean }>(
          "select public.automation_definition_valid($1) valid",
          [JSON.stringify(altered)],
        )
      ).rows[0]?.valid,
    ).toBe(false);
  }
});
it("enforces ownership, immutable direct-write boundaries and compare-and-swap revisions", async () => {
  await expect(cmd("pause", {}, flowId, null)).rejects.toThrow("changed");
  await cmd("save", { title: "Updated", definition: definition() });
  await expect(cmd("pause", {}, flowId, 1)).rejects.toThrow("changed");
  await identity(userB);
  await expect(cmd("pause")).rejects.toThrow("unavailable");
  expect(
    (await db.query("select id from public.automation_flows")).rows,
  ).toEqual([]);
  await expect(
    db.query("update public.automation_flows set state='enabled'"),
  ).rejects.toThrow("permission denied");
  await db.exec("reset role;set role anon");
  await expect(
    db.query("select public.automation_flow_snapshot(null,false)"),
  ).rejects.toThrow("permission denied");
});
it("requires exact manifest review, current identity, rules and Direct validation", async () => {
  await expect(
    cmd("enable", { reviewed: true, digest: "a".repeat(64), ...actor }),
  ).rejects.toThrow("changed");
  await expect(
    cmd("enable", {
      reviewed: true,
      digest: flow.digest,
      actor_id: "99999",
      actor_type: "personal",
    }),
  ).rejects.toThrow("validate");
  await privileged(
    "update public.campaign_publishers set enabled=false where method='direct'",
  );
  await expect(enable()).rejects.toThrow("validate");
  await privileged(
    "update public.campaign_publishers set enabled=true,verified_at=now() where method='direct'",
  );
  await enable();
  expect(flow.state).toBe("enabled");
  await expect(campaign("start", actor)).rejects.toThrow(
    "waits for its approved automation",
  );
});
it("executes two total loop passes, persists Wait, archives distinct receipts and stops", async () => {
  await enable();
  expect(await tick()).toEqual({ campaign_ids: [] });
  expect(flow.current_schedule_id).toBeTruthy();
  await due();
  expect(await tick()).toEqual({ campaign_ids: [jobId] });
  await finish();
  await tick();
  expect(flow.step_index).toBe(2);
  expect(flow.wait_until).toBeTruthy();
  const boundary = flow.wait_until;
  await tick();
  expect(flow.wait_until).toBe(boundary);
  await privileged(
    "update public.automation_flows set wait_until=now()-interval '1 second',next_action_at=now()-interval '1 second'",
  );
  await tick();
  expect(flow.step_index).toBe(1);
  expect(flow.loop_counters[loop]).toBe(1);
  expect(flow.current_schedule_id).toBeTruthy();
  await tick();
  expect(flow.step_index).toBe(1);
  await due();
  expect(await tick()).toEqual({ campaign_ids: [jobId] });
  await finish("pending_admin");
  await tick();
  await privileged(
    "update public.automation_flows set wait_until=now()-interval '1 second',next_action_at=now()-interval '1 second'",
  );
  await tick();
  expect(flow.state).toBe("completed");
  expect(flow.stop_reason).toBe("Stop step");
  const runs = await db.query<{ outcomes: { state: string }[] }>(
    "select outcomes from public.campaign_schedule_runs order by scheduled_at",
  );
  expect(runs.rows).toHaveLength(2);
  expect(runs.rows.map((row) => row.outcomes[0]?.state)).toEqual([
    "live",
    "pending_admin",
  ]);
});
it("does not dispatch when the profile differs and blocks changes to approved content", async () => {
  await enable();
  expect(
    (
      await db.query<{ result: unknown }>(
        "select public.schedule_command('00000000-0000-4000-8000-000000000000',0,'tick',$1) result",
        [JSON.stringify({ ...actor, actor_id: "99999" })],
      )
    ).rows[0]!.result,
  ).toEqual({ campaign_ids: [] });
  expect(
    (await db.query("select id from public.campaign_schedules")).rows,
  ).toHaveLength(0);
  await privileged(
    "update public.campaign_jobs set title='Changed post' where id='77777777-7777-4777-8777-777777777777'",
  );
  await tick();
  expect(flow.state).toBe("blocked");
  expect(flow.current_schedule_id).toBeNull();
});
it("preserves elapsed wait boundaries across explicit pause and resume", async () => {
  const draft = definition();
  draft.steps.splice(1, 0, {
    id: crypto.randomUUID(),
    type: "wait",
    minutes: 60,
  });
  await cmd("save", { title: "Wait first", definition: draft });
  await enable();
  await tick();
  const until = flow.wait_until;
  expect(until).toBeTruthy();
  await cmd("pause");
  expect(flow.state).toBe("paused");
  await enable();
  expect(flow.wait_until).toBe(until);
  await tick();
  expect(flow.current_schedule_id).toBeNull();
});
it("prevents direct child schedule edits and revokes legacy core execution", async () => {
  await enable();
  await tick();
  const child = (
    await db.query<{ id: string; revision: number }>(
      "select id,revision from public.campaign_schedules",
    )
  ).rows[0]!;
  await expect(
    db.query("select public.schedule_command($1,$2,'pause','{}')", [
      child.id,
      child.revision,
    ]),
  ).rejects.toThrow("through its automation");
  await expect(
    db.query(
      "select staysuite_schedule_private.schedule_command($1,$2,'pause','{}')",
      [child.id, child.revision],
    ),
  ).rejects.toThrow("permission denied");
  const functions = await db.query<{ prosecdef: boolean }>(
    "select prosecdef from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname='public' and proname in('campaign_command','campaign_delete','schedule_command','automation_flow_command')",
  );
  expect(functions.rows.every((row) => !row.prosecdef)).toBe(true);
});
it("preserves the standalone campaign path after gateway changes", async () => {
  await cmd("delete");
  await campaign("approve", { digest: job.digest });
  await campaign("start", actor);
  expect(job.state).toBe("running");
  await finish();
  expect(job.state).toBe("completed");
});
it("retains archived events on deletion and rejects duplicate job ownership across flows", async () => {
  await expect(
    cmd(
      "create",
      { title: "Conflicting flow", definition: definition() },
      crypto.randomUUID(),
      0,
    ),
  ).rejects.toThrow("another automation");
  await cmd("pause");
  await cmd("delete");
  const history = automationSnapshotSchema.parse(
    (
      await db.query<{ result: unknown }>(
        "select public.automation_flow_snapshot(null,true) result",
      )
    ).rows[0]!.result,
  );
  expect(history.events.length).toBeGreaterThan(0);
  expect(history.events.every((event) => event.flow_id === null)).toBe(true);
  expect(
    (await db.query("select id from public.campaign_jobs")).rows,
  ).toHaveLength(1);
});
it("rolls back all approval changes when a later post has pending media", async () => {
  const mediaId = "99999999-9999-4999-8999-999999999999";
  await db.query("select public.campaign_command($1,0,'create',$2)", [
    mediaId,
    JSON.stringify({
      ...actor,
      title: "Pending media",
      plan: {
        version: 1,
        text: "Photo post",
        intervalMinutes: 1,
        groupIds: [group],
        media: [
          {
            name: "photo.png",
            type: "image/png",
            size: 100,
            sha256: "a".repeat(64),
          },
        ],
      },
      settings: { method: "direct", avoidNight: false },
    }),
  ]);
  const graph = definition();
  graph.steps = graph.steps.map((step) =>
    step.type === "post" ? { ...step, campaign_ids: [jobId, mediaId] } : step,
  );
  await cmd("save", { title: "Atomic review", definition: graph });
  await expect(enable()).rejects.toThrow();
  const rows = await db.query<{ approved_digest: string | null }>(
    "select approved_digest from public.campaign_jobs",
  );
  expect(rows.rows.every((row) => row.approved_digest === null)).toBe(true);
  await inspect();
  expect(flow.state).toBe("paused");
});
it("blocks a missed child occurrence without treating an earlier completed job as this run", async () => {
  await enable();
  await tick();
  await privileged(
    "update public.campaign_schedules set next_run_at=now()-interval '20 minutes' where automation_flow_id is not null",
  );
  await tick();
  await tick();
  expect(flow.state).toBe("blocked");
  expect(flow.step_index).toBe(1);
  expect(
    (
      await db.query<{ state: string }>(
        "select state from public.campaign_schedule_runs",
      )
    ).rows,
  ).toEqual([{ state: "missed" }]);
});
it("refuses structural edits/deletion while a current submission is unresolved", async () => {
  await enable();
  await tick();
  await due();
  await tick();
  await cmd("pause");
  await expect(
    cmd("save", {
      title: "Cannot erase in-flight state",
      definition: definition(),
    }),
  ).rejects.toThrow("Resolve");
  await expect(cmd("delete")).rejects.toThrow("Resolve");
  await expect(
    db.query("select public.campaign_delete($1,$2,false)", [
      jobId,
      job.revision,
    ]),
  ).rejects.toThrow("resolve");
});

const templateId = "99999999-9999-4999-8999-999999999999";
const assetId = "abababab-abab-4bab-8bab-abababababab";
const requestId = "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd";
function prepareInput() {
  return {
    request_id: requestId,
    template_id: templateId,
    template_revision: 1,
    group_ids: [group],
    ...actor,
    interval_minutes: 1,
    settings: { method: "direct", avoidNight: false },
  };
}
async function templateFixture(media = false) {
  const asset = {
    id: assetId,
    name: "fixture.png",
    content_type: "image/png",
    size: 8,
    sha256: "a".repeat(64),
    object_path: `${userA}/${templateId}/${assetId}`,
    uploaded: true,
  };
  await db.query(
    "insert into public.post_templates(id,user_id,name,text,assets,state) values($1,$2,'Template fixture','  Exact template text  ',$3,'ready')",
    [templateId, userA, JSON.stringify(media ? [asset] : [])],
  );
  if (media)
    await privileged(
      `insert into storage.objects(bucket_id,name,metadata) values('template-media','${asset.object_path}','{"size":8,"mimetype":"image/png"}');`,
    );
}
async function prepare(input: unknown = prepareInput()) {
  return automationPreparedReplySchema.parse(
    (
      await db.query<{ result: unknown }>(
        "select public.automation_prepare_template($1) result",
        [JSON.stringify(input)],
      )
    ).rows[0]!.result,
  );
}
it("compiles exact owned template text and reuses idempotent requests without a second job", async () => {
  await templateFixture();
  const first = await prepare(),
    again = await prepare();
  expect(first.job.plan.text).toBe("  Exact template text  ");
  expect(again.job.id).toBe(first.job.id);
  expect(first.job.state).toBe("draft");
  await expect(
    prepare({ ...prepareInput(), interval_minutes: 2 }),
  ).rejects.toThrow("request changed");
  await expect(
    db.exec("update public.automation_prepared_posts set template_revision=2"),
  ).rejects.toThrow("permission denied");
  await identity(userB);
  await expect(prepare()).rejects.toThrow("unavailable");
  expect(
    (await db.query("select * from public.automation_prepared_posts")).rows,
  ).toEqual([]);
});
it("binds uploaded private media references and invalidates approvals when their template changes", async () => {
  await templateFixture(true);
  const result = await prepare();
  const media = result.job.media[0]!;
  expect(media.source_object_path).toBe(`${userA}/${templateId}/${assetId}`);
  expect(media.source_template_id).toBe(templateId);
  expect(media.uploaded).toBe(true);
  const approved = campaignJobSchema.parse(
    (
      await db.query<{ result: unknown }>(
        "select public.campaign_command($1,$2,'approve',$3) result",
        [
          result.job.id,
          result.job.revision,
          JSON.stringify({ digest: result.job.digest }),
        ],
      )
    ).rows[0]!.result,
  );
  expect(approved.state).toBe("ready");
  await expect(
    db.query("select public.campaign_command($1,$2,'bind_actor',$3)", [
      approved.id,
      approved.revision,
      JSON.stringify(actor),
    ]),
  ).rejects.toThrow("new version");
  await db.query(
    "update public.post_templates set text='Changed text',revision=revision+1 where id=$1",
    [templateId],
  );
  await expect(
    db.query("select public.campaign_command($1,$2,'start',$3)", [
      approved.id,
      approved.revision,
      JSON.stringify(actor),
    ]),
  ).rejects.toThrow("changed");
  await expect(prepare()).rejects.toThrow("changed");
});
it("rolls back preparation with missing blobs and refuses deleted template sources", async () => {
  await templateFixture(true);
  await privileged("delete from storage.objects");
  await expect(prepare()).rejects.toThrow("unavailable or changed");
  expect(
    (await db.query("select * from public.automation_prepared_posts")).rows,
  ).toEqual([]);
  expect(
    (await db.query("select id from public.campaign_jobs")).rows,
  ).toHaveLength(1);
  await privileged(
    `insert into storage.objects(bucket_id,name,metadata) values('template-media','${userA}/${templateId}/${assetId}','{"size":8,"mimetype":"image/png"}');`,
  );
  const result = await prepare();
  await db.query("delete from public.post_templates where id=$1", [templateId]);
  await expect(
    db.query("select public.campaign_command($1,$2,'approve',$3)", [
      result.job.id,
      result.job.revision,
      JSON.stringify({ digest: result.job.digest }),
    ]),
  ).rejects.toThrow("changed");
});
it("retains the prior approval digest for ordinary text and attachment campaigns", async () => {
  const oldMigration = await readFile(
    fileURLToPath(
      new URL(
        "../../supabase/migrations/20261023145846_campaign_management.sql",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  const start = oldMigration.indexOf(
    "create or replace function staysuite_campaign_private.snapshot",
  );
  const original = oldMigration
    .slice(start, oldMigration.indexOf("$$;", start) + 3)
    .replace(
      "staysuite_campaign_private.snapshot",
      "public.fixture_legacy_snapshot",
    );
  await privileged(original);
  const assertUnchanged = async () => {
    const rows = await db.query<{ old: string; current: string }>(
      "select public.fixture_legacy_snapshot($1) old,(public.campaign_command($1,0,'inspect','{}')->>'digest') current",
      [jobId],
    );
    expect(rows.rows[0]!.current).toBe(rows.rows[0]!.old);
  };
  await assertUnchanged();
  await privileged(
    `insert into public.campaign_media(campaign_id,position,object_path,manifest,uploaded) values('${jobId}',0,'${userA}/${jobId}/fixture','{"name":"fixture.png","type":"image/png","size":8,"sha256":"${"a".repeat(64)}"}',true);`,
  );
  await assertUnchanged();
});
it("rejects unsupported media-only templates without inventing or truncating content", async () => {
  await templateFixture(true);
  await db.query(
    "update public.post_templates set text='',revision=revision+1 where id=$1",
    [templateId],
  );
  await expect(
    prepare({ ...prepareInput(), template_revision: 2 }),
  ).rejects.toThrow("requires post text");
});
it("runs a prepared template post through the flow and archives its actual submission receipt", async () => {
  await templateFixture(true);
  const prepared = await prepare();
  await cmd("save", {
    title: "Template flow",
    definition: {
      version: 1,
      steps: [
        { id: trigger, type: "trigger", cadence: null },
        { id: postStep, type: "post", campaign_ids: [prepared.job.id] },
        { id: stop, type: "stop" },
      ],
    },
  });
  await enable();
  await tick();
  await due();
  const dispatch = await tick();
  expect(dispatch.campaign_ids).toEqual([prepared.job.id]);
  let compiled = campaignJobSchema.parse(
    (
      await db.query<{ result: unknown }>(
        "select public.campaign_command($1,0,'inspect','{}') result",
        [prepared.job.id],
      )
    ).rows[0]!.result,
  );
  compiled = campaignJobSchema.parse(
    (
      await db.query<{ result: unknown }>(
        "select public.campaign_command($1,$2,'claim',$3) result",
        [compiled.id, compiled.revision, JSON.stringify(actor)],
      )
    ).rows[0]!.result,
  );
  await db.query("select public.campaign_command($1,$2,'report',$3)", [
    compiled.id,
    compiled.revision,
    JSON.stringify({
      attempt_token: compiled.targets[0]!.attempt_token,
      outcome: "live",
      provider_code: "direct_story_receipt",
      post_url: "https://www.facebook.com/groups/12345/posts/125/",
    }),
  ]);
  await tick();
  expect(flow.state).toBe("completed");
  const runs = await db.query<{ outcomes: { post_url: string }[] }>(
    "select outcomes from public.campaign_schedule_runs",
  );
  expect(runs.rows[0]!.outcomes[0]!.post_url).toContain("/125/");
  expect(
    (
      await db.query(
        "select id from storage.objects where bucket_id='template-media'",
      )
    ).rows,
  ).toHaveLength(1);
});
it("keeps legacy private cores inaccessible after installing template and flow gates", async () => {
  const allowed = [
    "command",
    "snapshot",
    "schedule_gate",
    "delete_gate",
    "template_campaign_gate",
    "prepare_template",
  ];
  const functions = await db.query<{ proname: string; allowed: boolean }>(
    "select p.proname,has_function_privilege('authenticated',p.oid,'execute') allowed from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='staysuite_flow_private'",
  );
  expect(
    functions.rows
      .filter((row) => row.allowed)
      .map((row) => row.proname)
      .sort(),
  ).toEqual(allowed.sort());
  for (const name of [
    "automation_flow_command",
    "automation_flow_snapshot",
    "automation_prepare_template",
  ]) {
    const grants = await db.query<{ anon: boolean; definer: boolean }>(
      "select has_function_privilege('anon',p.oid,'execute') anon,p.prosecdef definer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname=$1",
      [name],
    );
    expect(grants.rows[0]).toEqual({ anon: false, definer: false });
  }
});
it("skips recurring missed starts and lets Stop terminate a recurring trigger", async () => {
  const cadence = {
    frequency: "daily" as const,
    starts_at: new Date(Date.now() + 3600000).toISOString(),
    interval: 1,
    weekdays: [],
    month_days: [],
    ends_at: null,
  };
  const recurring = definition();
  recurring.steps[0] = { id: trigger, type: "trigger", cadence };
  await cmd("save", { title: "Recurring", definition: recurring });
  await enable();
  await privileged(
    "update public.automation_flows set next_action_at=now()-interval '20 minutes'",
  );
  await tick();
  expect(flow.state).toBe("enabled");
  expect(flow.cycle).toBe(0);
  expect(flow.current_schedule_id).toBeNull();
  expect(Date.parse(flow.next_action_at!)).toBeGreaterThan(Date.now());
  await privileged(
    `update public.automation_flows set step_index=4,cycle_started_at=now(),next_action_at=now()-interval '1 second'`,
  );
  await tick();
  expect(flow.state).toBe("completed");
  expect(flow.stop_reason).toBe("Stop step");
  expect(flow.next_action_at).toBeNull();
});
it("keeps source files when a prepared post is removed", async () => {
  await templateFixture(true);
  const result = await prepare();
  const first = campaignJobSchema.parse(
    (
      await db.query<{ result: unknown }>(
        "select public.campaign_delete($1,$2,false) result",
        [result.job.id, result.job.revision],
      )
    ).rows[0]!.result,
  );
  await db.query("select public.campaign_delete($1,$2,true)", [
    first.id,
    first.revision,
  ]);
  expect(
    (
      await db.query(
        "select id from storage.objects where bucket_id='template-media'",
      )
    ).rows,
  ).toHaveLength(1);
  expect(
    (await db.query("select id from public.post_templates")).rows,
  ).toHaveLength(1);
  expect(
    (await db.query("select request_id from public.automation_prepared_posts"))
      .rows,
  ).toEqual([]);
});

it("enforces the exact untrimmed UTF-16 publisher limit for templates and direct RPC plans", async () => {
  await templateFixture(true);
  let revision = 1;
  for (const text of ["x".repeat(9999) + "  ", "😀".repeat(5001)]) {
    await db.query(
      "update public.post_templates set text=$2,revision=revision+1 where id=$1",
      [templateId, text],
    );
    revision++;
    await expect(
      prepare({ ...prepareInput(), template_revision: revision }),
    ).rejects.toThrow("requires post text");
    await expect(
      campaign("edit", { plan: { ...job.plan, text } }),
    ).rejects.toThrow("exceeds 10000");
  }
  expect(
    (await db.query("select request_id from public.automation_prepared_posts"))
      .rows,
  ).toEqual([]);
  await db.query(
    "update public.post_templates set text=$2,revision=revision+1 where id=$1",
    [templateId, "😀".repeat(5000)],
  );
  revision++;
  const prepared = await prepare({
    ...prepareInput(),
    template_revision: revision,
  });
  expect(prepared.job.plan.text.length).toBe(10000);
});
