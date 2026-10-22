import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
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
beforeEach(async () => {
  await db.exec(
    `reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${userA}', false)`,
  );
});
afterAll(async () => {
  await db?.close();
});
describe("actual migration and PostgreSQL RLS (minimal Supabase Auth schema)", () => {
  it("restricts reads to the authenticated owner", async () => {
    const result = await db.query<{ id: string }>(
      "select id from public.profiles",
    );
    expect(result.rows).toEqual([{ id: userA }]);
  });
  it("denies anonymous reads", async () => {
    await db.exec("reset role; set role anon");
    await expect(db.query("select * from public.profiles")).rejects.toThrow(
      "permission denied",
    );
  });
  it("denies authenticated requests without an identity", async () => {
    await db.exec("select set_config('request.jwt.claim.sub', '', false)");
    expect((await db.query("select * from public.profiles")).rows).toEqual([]);
  });
  it("allows an owner update", async () => {
    await db.query(
      "update public.profiles set display_name = 'Updated' where id = $1",
      [userA],
    );
    expect(
      (
        await db.query<{ display_name: string }>(
          "select display_name from public.profiles",
        )
      ).rows[0]?.display_name,
    ).toBe("Updated");
  });
  it("prevents cross-user updates", async () => {
    expect(
      (
        await db.query(
          "update public.profiles set display_name = $1 where id = $2 returning id",
          ["Forged", userB],
        )
      ).rows,
    ).toEqual([]);
  });
  it("prevents ownership reassignment", async () => {
    await expect(
      db.query("update public.profiles set id = $1 where id = $2", [
        userC,
        userA,
      ]),
    ).rejects.toThrow("row-level security");
  });
  it("prevents forged inserts", async () => {
    await expect(
      db.query("insert into public.profiles (id) values ($1)", [userC]),
    ).rejects.toThrow("row-level security");
  });
  it("allows a user to create their own profile", async () => {
    await db.exec(
      `select set_config('request.jwt.claim.sub', '${userC}', false)`,
    );
    await db.query(
      "insert into public.profiles (id, display_name) values ($1,$2)",
      [userC, "New host"],
    );
    expect((await db.query("select id from public.profiles")).rows).toEqual([
      { id: userC },
    ]);
  });
  it("denies profile deletion", async () => {
    await expect(db.query("delete from public.profiles")).rejects.toThrow(
      "permission denied",
    );
  });
});
