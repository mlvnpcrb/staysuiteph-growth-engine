import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  select: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  supabaseServer: async () => ({
    auth: { getUser: mocks.user },
    from: () => ({ select: mocks.select }),
    rpc: mocks.rpc,
  }),
}));
import { GET } from "../../apps/web/src/app/api/campaigns/publisher/route";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({
    data: { user: { id: "owner" } },
    error: null,
  });
});
it("denies anonymous sessions without reading publisher flags", async () => {
  mocks.user.mockResolvedValue({
    data: { user: { id: "owner", is_anonymous: true } },
    error: null,
  });
  expect((await GET()).status).toBe(401);
  expect(mocks.select).not.toHaveBeenCalled();
});
it("requires explicit enablement and validation time, failing closed on database errors", async () => {
  for (const row of [
    { method: "classic", enabled: false, verified_at: null },
    { method: "classic", enabled: true, verified_at: null },
    { method: "direct", enabled: true, verified_at: "now" },
  ]) {
    mocks.select.mockResolvedValue({ data: [row], error: null });
    expect(await (await GET()).json()).toEqual({
      viewer_id: "owner",
      classic: false,
    });
  }
  mocks.select.mockResolvedValue({
    data: [{ method: "classic", enabled: true, verified_at: "now" }],
    error: null,
  });
  expect((await (await GET()).json()).classic).toBe(true);
  mocks.select.mockResolvedValue({ error: new Error("private details") });
  const failed = await GET();
  expect(failed.status).toBe(503);
  expect(JSON.stringify(await failed.json())).not.toContain("private details");
});

it("checks actor-scoped validation and rejects invalid profile IDs", async () => {
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  const ready = await GET(
    new Request("http://localhost/api/campaigns/publisher?actor_id=12345"),
  );
  expect((await ready.json()).classic).toBe(true);
  expect(mocks.rpc).toHaveBeenCalledWith("campaign_publisher_ready", {
    p_actor_id: "12345",
  });
  expect(
    (
      await GET(
        new Request("http://localhost/api/campaigns/publisher?actor_id=bad"),
      )
    ).status,
  ).toBe(400);
});

it("keeps the connection readable and publishing disabled until validation migration exists", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
  const response = await GET(
    new Request("http://localhost/api/campaigns/publisher?actor_id=12345"),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    classic: false,
    validation_available: false,
  });
});
