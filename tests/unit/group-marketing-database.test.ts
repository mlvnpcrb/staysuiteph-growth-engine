import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
it("marketing migration preserves data/policies and grants only owner-scoped evidence updates", async () => {
  const db = new PGlite();
  const a = "11111111-1111-4111-8111-111111111111",
    b = "22222222-2222-4222-8222-222222222222";
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;insert into auth.users values('${a}'),('${b}');`,
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
      `insert into public.saved_groups(user_id,identity,url,title,destination,accommodation,audience,notes)values('${a}','fixture','https://www.facebook.com/groups/fixture/','Fixture group','Cebu','Condo','Guests','Keep note');`,
    );
    const policies = (
      await db.query(
        "select * from pg_policies where tablename='saved_groups' order by policyname",
      )
    ).rows;
    await db.exec(
      "begin;" +
        (await readFile(
          new URL(
            "../../supabase/migrations/20261023020000_group_marketing_evidence.sql",
            import.meta.url,
          ),
          "utf8",
        )) +
        "commit;",
    );
    expect(
      (
        await db.query(
          "select notes,marketing_evidence from public.saved_groups",
        )
      ).rows,
    ).toEqual([{ notes: "Keep note", marketing_evidence: {} }]);
    expect(
      (
        await db.query(
          "select * from pg_policies where tablename='saved_groups' order by policyname",
        )
      ).rows,
    ).toEqual(policies);
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${a}',false);update public.saved_groups set marketing_evidence='{"posts_7d":7}'::jsonb;`,
    );
    await expect(
      db.exec(
        `update public.saved_groups set marketing_evidence='{"member_names":["private"]}'::jsonb`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await db.exec(
      `select set_config('request.jwt.claim.sub','${b}',false);update public.saved_groups set marketing_evidence='{}';`,
    );
    expect((await db.query("select * from public.saved_groups")).rows).toEqual(
      [],
    );
    await db.exec(`select set_config('request.jwt.claim.sub','${a}',false)`);
    expect(
      (await db.query("select marketing_evidence from public.saved_groups"))
        .rows,
    ).toEqual([{ marketing_evidence: { posts_7d: 7 } }]);
    await expect(
      db.exec("update public.saved_groups set created_at=now()"),
    ).rejects.toMatchObject({ code: "42501" });
    await db.exec("reset role;set role anon");
    await expect(
      db.exec("select * from public.saved_groups"),
    ).rejects.toMatchObject({ code: "42501" });
  } finally {
    await db.close();
  }
}, 30000);
