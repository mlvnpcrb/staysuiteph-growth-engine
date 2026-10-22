import { afterAll, beforeAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
let db: PGlite;
let migration: string;
let before: unknown[];
let policies: unknown[];
let grants: unknown[];
const read = (name: string) =>
  readFile(
    new URL(`../../supabase/migrations/${name}`, import.meta.url),
    "utf8",
  );
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`,
  );
  for (const name of [
    "20261022053713_foundation_profiles.sql",
    "20261022061314_restrict_profile_columns.sql",
  ])
    await db.exec(await read(name));
  await db.exec(
    "insert into auth.users values('11111111-1111-4111-8111-111111111111');insert into public.profiles(id,display_name) values('11111111-1111-4111-8111-111111111111','Existing test profile');",
  );
  before = (await db.query("select * from public.profiles")).rows;
  policies = (
    await db.query(
      "select * from pg_policies where tablename='profiles' order by policyname",
    )
  ).rows;
  grants = (
    await db.query(
      "select grantee,column_name,privilege_type from information_schema.column_privileges where table_name='profiles' order by grantee,column_name,privilege_type",
    )
  ).rows;
  migration = await read("20261022122018_saved_groups.sql");
  await db.exec("begin;" + migration + "commit;");
}, 30000);
afterAll(async () => {
  await db?.close();
});
it("preserves existing profile rows, grants, RLS policies and Auth identity", async () => {
  expect((await db.query("select * from public.profiles")).rows).toEqual(
    before,
  );
  expect(
    (
      await db.query(
        "select * from pg_policies where tablename='profiles' order by policyname",
      )
    ).rows,
  ).toEqual(policies);
  expect(
    (
      await db.query(
        "select grantee,column_name,privilege_type from information_schema.column_privileges where table_name='profiles' order by grantee,column_name,privilege_type",
      )
    ).rows,
  ).toEqual(grants);
  expect(
    (await db.query("select count(*)::integer as n from auth.users")).rows,
  ).toEqual([{ n: 1 }]);
});
it("creates only one Phase 2 table, four ownership policies and three indexes without the parked owner registry", async () => {
  expect(
    (
      await db.query(
        "select tablename from pg_tables where schemaname='public' order by tablename",
      )
    ).rows,
  ).toEqual([{ tablename: "profiles" }, { tablename: "saved_groups" }]);
  expect(
    (
      await db.query(
        "select count(*)::integer as n from pg_policies where tablename='saved_groups'",
      )
    ).rows,
  ).toEqual([{ n: 4 }]);
  expect(
    (
      await db.query(
        "select count(*)::integer as n from pg_indexes where tablename='saved_groups'",
      )
    ).rows,
  ).toEqual([{ n: 3 }]);
  expect(
    (await db.query("select to_regnamespace('staysuite_private') as parked"))
      .rows,
  ).toEqual([{ parked: null }]);
});
it("rejects duplicate application atomically without altering existing saved data", async () => {
  await db.exec(
    "insert into public.saved_groups(user_id,identity,url,title,destination,accommodation,audience) values('11111111-1111-4111-8111-111111111111','fixture','https://www.facebook.com/groups/fixture/','Existing fixture','Cebu','Condo','Hosts');",
  );
  const saved = (await db.query("select * from public.saved_groups")).rows;
  await expect(db.exec("begin;" + migration + "commit;")).rejects.toMatchObject(
    { code: "42P07" },
  );
  await db.exec("rollback;");
  expect((await db.query("select * from public.saved_groups")).rows).toEqual(
    saved,
  );
  expect((await db.query("select * from public.profiles")).rows).toEqual(
    before,
  );
});
