import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { it, expect } from "vitest";
import { addGroupSchema } from "@staysuite/validation";
it("accepts name/link-only imports without fabricated hosting attributes", () => {
  expect(
    addGroupSchema.parse({
      url: "https://facebook.com/groups/fixture/",
      title: "Fixture group",
    }),
  ).toMatchObject({ destination: "", accommodation: "", audience: "" });
  expect(
    addGroupSchema.safeParse({
      url: "https://facebook.com/groups/fixture/",
      title: "Fixture group",
      destination: "X",
    }).success,
  ).toBe(false);
});
it("optional-context migration preserves rows and RLS while permitting owner-only later edits", async () => {
  const db = new PGlite();
  try {
    const owner = "11111111-1111-4111-8111-111111111111",
      other = "22222222-2222-4222-8222-222222222222";
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;insert into auth.users values('${owner}'),('${other}');`,
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
    await db.exec(
      `insert into public.saved_groups(user_id,identity,url,title,destination,accommodation,audience,notes)values('${owner}','existing','https://www.facebook.com/groups/existing/','Existing group','Cebu','Condo','Guests','Keep this note');`,
    );
    const before = (await db.query("select * from public.saved_groups")).rows;
    const policies = (
      await db.query(
        "select * from pg_policies where tablename='saved_groups' order by policyname",
      )
    ).rows;
    await db.exec(
      "begin;" +
        (await readFile(
          new URL(
            "../../supabase/migrations/20261023010000_optional_group_context.sql",
            import.meta.url,
          ),
          "utf8",
        )) +
        "commit;",
    );
    expect((await db.query("select * from public.saved_groups")).rows).toEqual(
      before,
    );
    expect(
      (
        await db.query(
          "select * from pg_policies where tablename='saved_groups' order by policyname",
        )
      ).rows,
    ).toEqual(policies);
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);insert into public.saved_groups(user_id,identity,url,title,destination,accommodation,audience)values('${owner}','new','https://www.facebook.com/groups/new/','New group','','','');update public.saved_groups set destination='Bohol',accommodation='Resort',audience='Hosts' where identity='new';`,
    );
    expect(
      (
        await db.query(
          "select destination from public.saved_groups where identity='new'",
        )
      ).rows,
    ).toEqual([{ destination: "Bohol" }]);
    await db.exec(
      `select set_config('request.jwt.claim.sub','${other}',false);update public.saved_groups set destination='Intrusion' where identity='new';`,
    );
    expect((await db.query("select * from public.saved_groups")).rows).toEqual(
      [],
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','${owner}',false);`,
    );
    expect(
      (
        await db.query(
          "select destination from public.saved_groups where identity='new'",
        )
      ).rows,
    ).toEqual([{ destination: "Bohol" }]);
    await expect(
      db.exec(
        "update public.saved_groups set created_at=now() where identity='new'",
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await db.exec("reset role;set role anon");
    await expect(
      db.exec("select * from public.saved_groups"),
    ).rejects.toMatchObject({ code: "42501" });
  } finally {
    await db.close();
  }
}, 30000);
