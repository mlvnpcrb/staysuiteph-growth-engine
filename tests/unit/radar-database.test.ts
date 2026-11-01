import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { radarReplySchema, matchRadarText } from "@staysuite/validation";
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
  scope = "personal:12345",
  otherScope = "page:67890";
const settings = {
  group_ids: [group],
  keyword_rules: {
    exact: ["looking for"],
    broad: ["beach accommodation"],
    negative: ["free"],
  },
  scan_interval: 30,
  in_page_notifications: true,
  desktop_notifications: true,
  reply_preferences: {
    style: "helpful",
    selling: "soft",
    directness: "balanced",
    context: "",
  },
};
async function identity(id = userA) {
  await db.exec("reset role;set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function cmd(
  operation: string,
  payload: unknown = {},
  revision = 1,
  profile = scope,
) {
  return radarReplySchema.parse(
    (
      await db.query<{ result: unknown }>(
        "select public.radar_command($1,$2,$3,$4) result",
        [profile, revision, operation, JSON.stringify(payload)],
      )
    ).rows[0]!.result,
  );
}
const post = (text = "Looking for a beach accommodation", post_id = "123") => ({
  group_id: group,
  post_id,
  text,
  author: "Fixture enquiry",
  post_created_at: null,
});
beforeEach(async () => {
  await db.exec(
    `reset role;truncate public.radar_settings,public.saved_groups cascade;insert into public.saved_groups(id,user_id,identity,url,title,destination,accommodation,audience)values('${group}','${userA}','12345','https://www.facebook.com/groups/12345/','Fixture group','','','');`,
  );
  await identity();
  await cmd("save_settings", settings, 0);
});
afterAll(async () => {
  await db?.close();
});
it("saves per-profile settings and rejects stale, null and foreign ownership", async () => {
  await cmd("save_settings", settings, 0, otherScope);
  expect((await cmd("save_settings", settings)).settings?.revision).toBe(2);
  await expect(cmd("save_settings", settings)).rejects.toThrow("changed");
  await identity(userB);
  await expect(cmd("save_settings", settings, 0)).rejects.toThrow(
    "unavailable",
  );
  expect((await db.query("select * from public.radar_settings")).rows).toEqual(
    [],
  );
});
it("matches exact/broad terms, excludes negatives and deduplicates posts", async () => {
  const first = await cmd("ingest", post());
  expect(first.lead?.matched_keywords).toEqual([
    "looking for",
    "beach accommodation",
  ]);
  expect((await cmd("ingest", post())).duplicate).toBe(true);
  expect(
    (await cmd("ingest", post("Looking for free accommodation", "124")))
      .matched,
  ).toBe(false);
  expect(
    (await cmd("ingest", post("Accommodations for a beach", "125"))).matched,
  ).toBe(false);
});
it("compares PostgreSQL matching with the source-derived Unicode contract", async () => {
  const cases = [
    [
      "I’m looking for a freelancer",
      { exact: ["i'm looking for"], broad: [], negative: ["free"] },
    ],
    ["We read this ad", { exact: ["ad"], broad: [], negative: [] }],
    [
      "Can someone recommend café rooms?",
      { exact: ["café"], broad: ["rooms recommend"], negative: [] },
    ],
    ["我需要住宿推荐", { exact: ["住宿"], broad: [], negative: [] }],
    ["Need C++ help (cheap)", { exact: ["C++"], broad: [], negative: [] }],
    [
      "Need accommodation—beach",
      { exact: [], broad: ["beach accommodation"], negative: [] },
    ],
  ] as const;
  for (const [text, raw] of cases) {
    const rules = {
      exact: [...raw.exact],
      broad: [...raw.broad],
      negative: [...raw.negative],
    };
    const result = await db.query<{ matches: string[] }>(
      "select public.radar_match($1,$2) matches",
      [text, JSON.stringify(rules)],
    );
    expect(result.rows[0]?.matches).toEqual(matchRadarText(text, rules));
  }
});
it("updates stages, notes, read and starred flags with compare-and-swap", async () => {
  const lead = (await cmd("ingest", post())).lead!;
  const changed = (
    await cmd("update_lead", {
      id: lead.id,
      changes: {
        stage: "conversation",
        is_read: true,
        is_starred: true,
        note: "Follow up",
      },
    })
  ).lead!;
  expect(changed).toMatchObject({
    revision: 2,
    stage: "conversation",
    is_read: true,
    is_starred: true,
    note: "Follow up",
  });
  await expect(
    cmd("update_lead", { id: lead.id, changes: { stage: "customer" } }),
  ).rejects.toThrow("changed");
  await expect(
    cmd("update_lead", { id: lead.id, changes: { is_read: null } }, 2),
  ).rejects.toThrow("Check lead changes");
});
it("retains dedupe tombstones while clearing private text and prevents another scope or user from editing leads", async () => {
  const lead = (await cmd("ingest", post())).lead!;
  await cmd("save_settings", settings, 0, otherScope);
  await expect(
    cmd("delete_lead", { id: lead.id }, 1, otherScope),
  ).rejects.toThrow("unavailable");
  await identity(userB);
  await expect(cmd("delete_lead", { id: lead.id })).rejects.toThrow(
    "settings first",
  );
  await identity();
  await cmd("delete_lead", { id: lead.id });
  expect((await cmd("ingest", post())).lead).toBeNull();
  expect((await db.query("select * from public.radar_leads")).rows).toEqual([]);
  await db.exec("reset role");
  expect(
    (await db.query<{ text: string }>("select text from public.radar_leads"))
      .rows[0]?.text,
  ).toBe("");
});
it("clears only the requested profile through the displayed cutoff", async () => {
  await cmd("ingest", post());
  await cmd("save_settings", settings, 0, otherScope);
  await cmd("ingest", post(), 1, otherScope);
  expect(
    (await cmd("clear", { before: new Date().toISOString() })).deleted,
  ).toBe(1);
  expect((await db.query("select scope from public.radar_leads")).rows).toEqual(
    [{ scope: otherScope }],
  );
});
it("rejects unknown groups, future dates, unreviewed revisions and direct writes", async () => {
  await expect(cmd("ingest", { ...post(), group_id: userC })).rejects.toThrow(
    "not in this",
  );
  await expect(
    cmd("ingest", { ...post(), post_created_at: "2099-01-01T00:00:00Z" }),
  ).rejects.toThrow("future");
  await expect(cmd("ingest", post(), 2)).rejects.toThrow("changed");
  await expect(
    db.query("update public.radar_settings set revision=999"),
  ).rejects.toThrow("permission denied");
  await db.exec("reset role;set role anon");
  await expect(
    db.query("select public.radar_command('personal:12345',0,'clear','{}')"),
  ).rejects.toThrow("permission denied");
});
it("keeps non-Latin combining marks and Unicode numbers inside keyword boundaries", async () => {
  for (const [text, keyword] of [
    ["عَ", "ع"],
    ["ก้", "ก"],
    ["xⅫ", "x"],
    ["x𝟠", "x"],
    ["x²", "x"],
    ["क्", "क"],
  ]) {
    const rules = { exact: [keyword!], broad: [], negative: [] };
    const actual = await db.query<{ matches: string[] }>(
      "select public.radar_match($1,$2) matches",
      [text, JSON.stringify(rules)],
    );
    expect(actual.rows[0]?.matches, `${text}/${keyword}`).toEqual(
      matchRadarText(text!, rules),
    );
  }
});
