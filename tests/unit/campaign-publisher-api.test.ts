import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), select: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabaseServer: async () => ({
    auth: { getUser: mocks.user },
    from: () => ({ select: mocks.select }),
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
