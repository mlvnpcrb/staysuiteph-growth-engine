import { afterEach, expect, it, vi } from "vitest";
import { tokenDatabase, groupRepository } from "../../packages/database/src";
const owner = "11111111-1111-4111-8111-111111111111";
afterEach(() => vi.unstubAllGlobals());
it("persists/reloads using the SDK data layer, sends owner filters, ignores duplicates and preserves notes", async () => {
  const rows: Record<string, unknown>[] = [];
  const requests: { method: string; url: URL }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      const method = request.method;
      requests.push({ method, url });
      expect(request.headers.get("authorization")).toBe("Bearer fixture-token");
      let result: Record<string, unknown>[] = rows;
      if (method === "POST") {
        const body = await request.json();
        expect(body.user_id).toBe(owner);
        if (rows.length) result = [];
        else {
          rows.push({ ...body, id: owner, notes: "Original note" });
          result = rows;
        }
        expect(request.headers.get("prefer")).toContain(
          "resolution=ignore-duplicates",
        );
      } else {
        expect(url.searchParams.get("user_id")).toBe(`eq.${owner}`);
        if (method === "PATCH") {
          Object.assign(rows[0]!, await request.json());
        }
        if (method === "DELETE") rows.splice(0);
      }
      if (method === "POST") {
        if (!result.length)
          return new Response(
            JSON.stringify({
              code: "PGRST116",
              details: "The result contains 0 rows",
              message: "JSON object requested, multiple (or no) rows returned",
            }),
            { status: 406, headers: { "content-type": "application/json" } },
          );
        return new Response(JSON.stringify(result[0]), {
          headers: { "content-type": "application/json" },
        });
      }
      if (method === "HEAD")
        return new Response(null, { headers: { "content-range": "0-0/0" } });
      if (method === "GET" && url.searchParams.has("identity"))
        return new Response(JSON.stringify(rows[0]), {
          headers: { "content-type": "application/json" },
        });
      return new Response(JSON.stringify(result), {
        headers: {
          "content-type": "application/json",
          "content-range": `0-0/${rows.length}`,
        },
      });
    }),
  );
  const repo = groupRepository(
    tokenDatabase(
      "https://fixture.supabase.co",
      "public-fixture-key",
      "fixture-token",
    ),
    owner,
  );
  const input = {
    identity: "cebu",
    url: "https://www.facebook.com/groups/cebu/",
    title: "Fixture",
    destination: "Cebu",
    accommodation: "Condo",
    audience: "Guests",
    evidence: "User input",
  };
  expect((await repo.save(input)).duplicate).toBe(false);
  expect((await repo.save(input)).duplicate).toBe(true);
  expect((await repo.list()).groups[0]?.notes).toBe("Original note");
  await repo.update(owner, {
    notes: "",
    review_status: "review_required",
    rule_evidence: "",
    last_reviewed_at: null,
  });
  expect((await repo.list()).groups[0]?.notes).toBe("");
  await repo.remove(owner);
  expect((await repo.list()).stats.total).toBe(0);
  expect(
    requests
      .filter((r) => r.method === "PATCH" || r.method === "DELETE")
      .every((r) => r.url.searchParams.get("id") === `eq.${owner}`),
  ).toBe(true);
});

it("looks up only requested identities owned by the verified user, beyond the UI list limit", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init),
        url = new URL(request.url);
      expect(url.searchParams.get("user_id")).toBe(`eq.${owner}`);
      expect(url.searchParams.get("identity")).toBe("in.(example)");
      expect(url.searchParams.get("select")).toBe("identity");
      return new Response(JSON.stringify([{ identity: "example" }]), {
        headers: { "content-type": "application/json" },
      });
    }),
  );
  const repo = groupRepository(
    tokenDatabase(
      "https://fixture.supabase.co",
      "public-fixture",
      "fixture-token",
    ),
    owner,
  );
  expect(await repo.duplicates(["example"])).toEqual(["example"]);
});
