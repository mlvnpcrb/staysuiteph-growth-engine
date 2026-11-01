import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import {
  libraryReplySchema,
  librarySnapshotSchema,
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
const collection = "44444444-4444-4444-8444-444444444444",
  category = "55555555-5555-4555-8555-555555555555",
  group = "66666666-6666-4666-8666-666666666666",
  template = "77777777-7777-4777-8777-777777777777";
async function identity(id = userA) {
  await db.exec("reset role;set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function cmd(
  operation: string,
  payload: unknown = {},
  id = collection,
  revision = 1,
) {
  return libraryReplySchema.parse(
    (
      await db.query<{ result: unknown }>(
        "select public.library_command($1,$2,$3,$4) result",
        [id, revision, operation, JSON.stringify(payload)],
      )
    ).rows[0]!.result,
  );
}
beforeEach(async () => {
  await db.exec(
    `reset role;truncate public.template_categories,public.group_collections,public.post_templates,public.saved_groups cascade;insert into public.saved_groups(id,user_id,identity,url,title,destination,accommodation,audience)values('${group}','${userA}','12345','https://www.facebook.com/groups/12345/','Fixture','','','');insert into public.post_templates(id,user_id,name,text)values('${template}','${userA}','Fixture','Text');`,
  );
  await identity();
});
afterAll(async () => {
  await db?.close();
});
it("creates ordered collections and protects revisions", async () => {
  const result = await cmd(
    "collection_create",
    { name: "Beach hosts", group_ids: [group] },
    collection,
    0,
  );
  expect(result.snapshot.collections[0]?.group_ids).toEqual([group]);
  await cmd("collection_save", { name: "Updated", group_ids: [] });
  await expect(cmd("collection_delete")).rejects.toThrow("changed");
});
it("rejects foreign groups and foreign collection commands", async () => {
  await identity(userB);
  await expect(
    cmd(
      "collection_create",
      { name: "Foreign", group_ids: [group] },
      collection,
      0,
    ),
  ).rejects.toThrow("not available");
  await identity();
  await cmd(
    "collection_create",
    { name: "Owned", group_ids: [group] },
    collection,
    0,
  );
  await identity(userB);
  await expect(cmd("collection_delete")).rejects.toThrow("not found");
  expect(
    librarySnapshotSchema.parse(
      (
        await db.query<{ result: unknown }>(
          "select public.library_snapshot() result",
        )
      ).rows[0]!.result,
    ).collections,
  ).toEqual([]);
});
it("duplicates and splits without removing original groups", async () => {
  await cmd(
    "collection_create",
    { name: "Original", group_ids: [group] },
    collection,
    0,
  );
  await cmd("collection_duplicate");
  const result = await cmd("collection_split", { size: 1 });
  expect(result.snapshot.collections).toHaveLength(3);
  await cmd("collection_delete");
  expect(
    (await db.query("select id from public.saved_groups")).rows,
  ).toHaveLength(1);
});
it("assigns categories with revision checking and retains template on category deletion", async () => {
  await cmd("category_create", { name: "Holiday" }, category, 0);
  const assigned = await cmd(
    "template_assign",
    { category_ids: [category] },
    template,
  );
  expect(assigned.template?.revision).toBe(2);
  await expect(
    cmd("template_assign", { category_ids: [] }, template),
  ).rejects.toThrow("changed");
  const deleted = await cmd("category_delete", {}, category);
  expect(deleted.snapshot.assignments).toEqual([]);
  expect(
    (
      await db.query<{ revision: number }>(
        "select revision from public.post_templates where id=$1",
        [template],
      )
    ).rows[0]?.revision,
  ).toBe(3);
});
it("rejects duplicate category names and foreign assignments atomically", async () => {
  await cmd("category_create", { name: "Holiday" }, category, 0);
  await expect(
    cmd("category_create", { name: "holiday" }, crypto.randomUUID(), 0),
  ).rejects.toThrow("duplicate");
  await identity(userB);
  await expect(
    cmd("template_assign", { category_ids: [category] }, template),
  ).rejects.toThrow("not found");
});
it("denies direct table writes and anonymous library access", async () => {
  await expect(
    db.query(
      "insert into public.template_categories(user_id,name) values($1,'Bypass')",
      [userA],
    ),
  ).rejects.toThrow("permission denied");
  await db.exec("reset role;set role anon");
  await expect(db.query("select public.library_snapshot()")).rejects.toThrow(
    "permission denied",
  );
});
