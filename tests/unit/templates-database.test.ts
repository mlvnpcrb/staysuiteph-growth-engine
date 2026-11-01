import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222",
  id = "33333333-3333-4333-8333-333333333333",
  assetId = "44444444-4444-4444-8444-444444444444";
let db: PGlite;
async function identity(actor: string, role = "authenticated") {
  await db.exec(`reset role;set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    actor,
  ]);
}
const asset = (owner = a) => ({
  id: assetId,
  name: "photo.png",
  content_type: "image/png",
  size: 100,
  sha256: "a".repeat(64),
  uploaded: false,
  object_path: `${owner}/${id}/${assetId}`,
});
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${a}'),('${b}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;`,
  );
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261101091713_post_templates.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}, 30000);
beforeEach(async () => {
  await db.exec("reset role;truncate public.post_templates,storage.objects");
  await identity(a);
  await db.query(
    "insert into public.post_templates(id,user_id,name,text,assets) values($1,$2,'My template','Hello',$3)",
    [id, a, JSON.stringify([asset()])],
  );
});
afterAll(async () => {
  await db?.close();
});
it("persists owner content and rejects cross-user access", async () => {
  expect(
    (await db.query("select name,text from public.post_templates")).rows,
  ).toEqual([{ name: "My template", text: "Hello" }]);
  await identity(b);
  expect((await db.query("select * from public.post_templates")).rows).toEqual(
    [],
  );
  expect(
    (
      await db.query(
        "update public.post_templates set text='forged',revision=2 returning id",
      )
    ).rows,
  ).toEqual([]);
  expect(
    (await db.query("delete from public.post_templates returning id")).rows,
  ).toEqual([]);
});
it("rejects anonymous access and forged ownership", async () => {
  await expect(
    db.query(
      "insert into public.post_templates(user_id,name,text) values($1,'Forged','bad')",
      [b],
    ),
  ).rejects.toMatchObject({ code: "42501" });
  await identity("", "anon");
  await expect(
    db.exec("select * from public.post_templates"),
  ).rejects.toMatchObject({ code: "42501" });
});
it("requires a compare-and-swap revision and immutable identity", async () => {
  await expect(
    db.exec("update public.post_templates set text='Changed'"),
  ).rejects.toMatchObject({ code: "40001" });
  await db.exec("update public.post_templates set text='Changed',revision=2");
  expect(
    (await db.query("select revision,text from public.post_templates")).rows,
  ).toEqual([{ revision: 2, text: "Changed" }]);
  await expect(
    db.query("update public.post_templates set user_id=$1,revision=3", [b]),
  ).rejects.toMatchObject({ code: "42501" });
  expect(
    (
      await db.query(
        "update public.post_templates set revision=2 where revision=1 returning id",
      )
    ).rows,
  ).toEqual([]);
});
it.each([
  { ...asset(), object_path: `${b}/${id}/${assetId}` },
  { ...asset(), content_type: null },
  { ...asset(), size: 1.2 },
  { ...asset(), size: 36700161 },
  { ...asset(), sha256: "bad" },
  { ...asset(), extra: "unexpected" },
])("rejects malformed/foreign attachment metadata %#", async (bad) => {
  await expect(
    db.query("update public.post_templates set assets=$1,revision=2", [
      JSON.stringify([bad]),
    ]),
  ).rejects.toMatchObject({ code: "23514" });
});
it("allows only reserved owner storage paths, blocks overwrites and cross-user reads", async () => {
  const path = asset().object_path;
  await db.query(
    "insert into storage.objects(bucket_id,name) values('template-media',$1)",
    [path],
  );
  await expect(
    db.query(
      "insert into storage.objects(bucket_id,name) values('template-media',$1)",
      [`${a}/${id}/unreserved`],
    ),
  ).rejects.toMatchObject({ code: "42501" });
  await identity(b);
  expect((await db.query("select * from storage.objects")).rows).toEqual([]);
  await expect(
    db.query(
      "insert into storage.objects(bucket_id,name) values('template-media',$1)",
      [path],
    ),
  ).rejects.toMatchObject({ code: "42501" });
  await identity(a);
  await expect(
    db.exec("update storage.objects set name='overwrite'"),
  ).rejects.toMatchObject({ code: "42501" });
});
it("locks deleting templates against updates and further uploads, permits cleanup", async () => {
  await db.exec("update public.post_templates set state='deleting',revision=2");
  await expect(
    db.exec("update public.post_templates set state='ready',revision=3"),
  ).rejects.toMatchObject({ code: "40001" });
  await expect(
    db.query(
      "insert into storage.objects(bucket_id,name) values('template-media',$1)",
      [asset().object_path],
    ),
  ).rejects.toMatchObject({ code: "42501" });
  await db.exec("delete from public.post_templates where revision=2");
  expect((await db.query("select * from public.post_templates")).rows).toEqual(
    [],
  );
});
