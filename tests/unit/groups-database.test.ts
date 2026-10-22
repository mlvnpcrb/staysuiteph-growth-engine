import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
let db: PGlite;
async function identity(id: string, role = "authenticated") {
  await db.exec(`reset role; set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;insert into auth.users values('${a}'),('${b}');`,
  );
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261022122018_saved_groups.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}, 30000);
beforeEach(async () => {
  await db.exec("reset role; truncate public.saved_groups");
  await identity(a);
  await insert(a);
  await identity(b);
  await insert(b);
  await identity(a);
});
afterAll(async () => {
  await db?.close();
});
async function insert(id: string, name = "Example fixture") {
  return db.query(
    "insert into public.saved_groups(user_id,identity,url,title,destination,accommodation,audience,evidence) values($1,'example','https://www.facebook.com/groups/example/',$2,'Cebu','Condo','Guests','User supplied text') returning id",
    [id, name],
  );
}
it.each([a, b])("persists and retrieves only user %s data", async (id) => {
  await identity(id);
  expect(
    (await db.query("select user_id from public.saved_groups")).rows,
  ).toEqual([{ user_id: id }]);
});
it("blocks anonymous read/write", async () => {
  await identity("", "anon");
  for (const sql of [
    "select * from public.saved_groups",
    "delete from public.saved_groups",
    "update public.saved_groups set notes='bad'",
  ])
    await expect(db.exec(sql)).rejects.toMatchObject({ code: "42501" });
});
it("blocks requests without a user identity", async () => {
  await identity("");
  expect((await db.query("select * from public.saved_groups")).rows).toEqual(
    [],
  );
});
it("prevents forged ownership on insert", async () => {
  await expect(insert(b)).rejects.toMatchObject({ code: "42501" });
});
it("deduplicates per user and safely ignores duplicate inserts", async () => {
  await expect(insert(a)).rejects.toMatchObject({ code: "23505" });
  await db.query(
    "insert into public.saved_groups(user_id,identity,url,title,destination,accommodation,audience,evidence) values($1,'example','https://www.facebook.com/groups/example/','Duplicate','Cebu','Condo','Guests','') on conflict(user_id,identity) do nothing",
    [a],
  );
  expect(
    (await db.query("select title from public.saved_groups")).rows,
  ).toEqual([{ title: "Example fixture" }]);
});
it.each([
  [a, b],
  [b, a],
])("prevents %s updating or deleting %s data", async (actor, target) => {
  await identity(actor);
  expect(
    (
      await db.query(
        "update public.saved_groups set notes=$1 where user_id=$2 returning id",
        ["Forged", target],
      )
    ).rows,
  ).toEqual([]);
  expect(
    (
      await db.query(
        "delete from public.saved_groups where user_id=$1 returning id",
        [target],
      )
    ).rows,
  ).toEqual([]);
});
it("supports notes edit/clear, reviewed evidence, and own shortlist removal", async () => {
  await db.exec("update public.saved_groups set notes='My note'");
  expect(
    (await db.query("select notes from public.saved_groups")).rows,
  ).toEqual([{ notes: "My note" }]);
  await db.exec(
    "update public.saved_groups set notes='',rule_evidence='Reviewed excerpt',review_status='reviewed',last_reviewed_at=now()",
  );
  expect(
    (await db.query("select notes,review_status from public.saved_groups"))
      .rows,
  ).toEqual([{ notes: "", review_status: "reviewed" }]);
  await db.exec("delete from public.saved_groups");
  expect((await db.query("select * from public.saved_groups")).rows).toEqual(
    [],
  );
  await identity(b);
  expect(
    (await db.query("select * from public.saved_groups")).rows,
  ).toHaveLength(1);
});
it("requires evidence and a review date to claim reviewed", async () => {
  await expect(
    db.exec("update public.saved_groups set review_status='reviewed'"),
  ).rejects.toMatchObject({ code: "23514" });
});
it.each(["user_id=user_id", "id=id", "created_at=now()", "updated_at=now()"])(
  "keeps metadata immutable: %s",
  async (assignment) => {
    await expect(
      db.exec(`update public.saved_groups set ${assignment}`),
    ).rejects.toMatchObject({ code: "42501" });
  },
);
