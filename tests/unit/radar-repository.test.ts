import { expect, it, vi } from "vitest";
import { radarRepository } from "../../packages/database/src/radar";
function fixture() {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    contains: vi.fn(),
    or: vi.fn(),
    maybeSingle: vi.fn(),
    then: vi.fn(),
  };
  for (const name of [
    "select",
    "eq",
    "is",
    "order",
    "limit",
    "contains",
    "or",
  ] as const)
    query[name].mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data: null, error: null });
  query.then.mockImplementation((resolve: (value: unknown) => unknown) =>
    Promise.resolve(resolve({ data: [], error: null })),
  );
  const from = vi.fn(() => query),
    rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
  return {
    query,
    from,
    rpc,
    repo: radarRepository(
      { from, rpc } as unknown as Parameters<typeof radarRepository>[0],
      "owner",
    ),
  };
}
it("scopes every list to owner, Facebook profile and non-deleted rows with stable ordering", async () => {
  const { repo, query, from } = fixture();
  await repo.leads({
    scope: "personal:12345",
    search: "",
    status: "starred",
    stage: "conversation",
    keyword: "rooms",
  });
  expect(from).toHaveBeenCalledWith("radar_leads");
  expect(query.eq).toHaveBeenCalledWith("user_id", "owner");
  expect(query.eq).toHaveBeenCalledWith("scope", "personal:12345");
  expect(query.is).toHaveBeenCalledWith("deleted_at", null);
  expect(query.eq).toHaveBeenCalledWith("is_starred", true);
  expect(query.contains).toHaveBeenCalledWith("matched_keywords", ["rooms"]);
  expect(query.order.mock.calls).toEqual([
    ["discovered_at", { ascending: false }],
    ["id", { ascending: false }],
  ]);
  expect(query.limit).toHaveBeenCalledWith(101);
});
it("quotes PostgREST search input and escapes literal wildcard characters", async () => {
  const { repo, query } = fixture();
  const search = 'a%_,x"),user_id.eq.other';
  await repo.leads(
    { scope: "personal:12345", search, status: "all" },
    { at: "2026-11-01T00:00:00Z", id: "11111111-1111-4111-8111-111111111111" },
  );
  expect(query.or.mock.calls[0]?.[0]).toBe(
    "author.ilike." +
      JSON.stringify("%" + search.replace(/[\\%_]/g, "\\$&") + "%") +
      ",text.ilike." +
      JSON.stringify("%" + search.replace(/[\\%_]/g, "\\$&") + "%"),
  );
  expect(query.or.mock.calls[1]?.[0]).toContain(
    "discovered_at.lt.2026-11-01T00:00:00Z",
  );
});
it("uses only bound RPC arguments for commands", async () => {
  const { repo, rpc } = fixture();
  await repo.command("personal:12345", 2, "update_lead", {
    id: "fixture",
    changes: { stage: "closed" },
  });
  expect(rpc).toHaveBeenCalledWith("radar_command", {
    p_scope: "personal:12345",
    p_revision: 2,
    p_operation: "update_lead",
    p_payload: { id: "fixture", changes: { stage: "closed" } },
  });
});
