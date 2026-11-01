import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  env: vi.fn(),
  client: vi.fn(),
  auth: vi.fn(),
  repo: vi.fn(),
  list: vi.fn(),
  runs: vi.fn(),
  command: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ environment: m.env }));
vi.mock("@/lib/supabase", () => ({ supabaseServer: m.client }));
vi.mock("@staysuite/database", () => ({ scheduleRepository: m.repo }));
import { GET, POST } from "../../apps/web/src/app/api/schedules/route";
const owner = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222";
const req = (body: unknown, origin = "http://localhost", viewer = owner) =>
  new Request("http://localhost/api/schedules", {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "x-staysuite-viewer": viewer,
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  m.env.mockReturnValue({ configured: true });
  m.client.mockResolvedValue({ auth: { getUser: m.auth } });
  m.auth.mockResolvedValue({ data: { user: { id: owner } }, error: null });
  m.repo.mockReturnValue({ list: m.list, runs: m.runs, command: m.command });
  m.list.mockResolvedValue([]);
  m.runs.mockResolvedValue([]);
});
it("rejects foreign origins, anonymous sessions and changed viewers", async () => {
  expect((await POST(req({}, "https://other.example"))).status).toBe(403);
  expect((await POST(req({}, "http://localhost", id))).status).toBe(409);
  for (const user of [null, { id: owner, is_anonymous: true }]) {
    m.auth.mockResolvedValue({ data: { user }, error: null });
    expect((await POST(req({}))).status).toBe(401);
  }
  expect(m.repo).not.toHaveBeenCalled();
});
it("returns only the session owner's schedules and run history without caching", async () => {
  const response = await GET(new Request("http://localhost/api/schedules"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    viewer_id: owner,
    schedules: [],
    runs: [],
  });
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(m.repo).toHaveBeenCalledWith(expect.anything(), owner);
});
it("rejects incomplete cadence, forged ownership and missing approval", async () => {
  for (const body of [
    { operation: "enable", id, revision: 1 },
    {
      operation: "tick",
      actor_id: "12345",
      actor_type: "personal",
      user_id: owner,
    },
    {
      operation: "create",
      campaign_id: id,
      revision: 1,
      cadence: { frequency: "weekly", starts_at: "2099-01-01T00:00:00Z" },
    },
  ])
    expect((await POST(req(body))).status).toBe(400);
  expect(m.command).not.toHaveBeenCalled();
});
it("sends only a validated actor to the serialized tick command", async () => {
  m.command.mockResolvedValue({ campaign_ids: [id] });
  const response = await POST(
    req({ operation: "tick", actor_id: "12345", actor_type: "personal" }),
  );
  expect(response.status).toBe(200);
  expect(m.command).toHaveBeenCalledWith(expect.any(String), 0, "tick", {
    actor_id: "12345",
    actor_type: "personal",
  });
});
it.each([
  ["PT409", 409],
  ["42501", 403],
  ["55000", 409],
  ["22023", 400],
  ["42P01", 503],
])("redacts storage errors %s", async (code, status) => {
  m.command.mockRejectedValue({ code, message: "private database details" });
  const response = await POST(req({ operation: "pause", id, revision: 1 }));
  expect(response.status).toBe(status);
  expect(JSON.stringify(await response.json())).not.toContain(
    "private database details",
  );
});
