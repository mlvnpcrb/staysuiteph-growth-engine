import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  env: vi.fn(),
  client: vi.fn(),
  auth: vi.fn(),
  repo: vi.fn(),
  snapshot: vi.fn(),
  command: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ environment: m.env }));
vi.mock("@/lib/supabase", () => ({ supabaseServer: m.client }));
vi.mock("@staysuite/database", () => ({ automationFlowRepository: m.repo }));
import { GET, POST } from "../../apps/web/src/app/api/automation-flows/route";
const owner = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222";
const req = (body: unknown, origin = "http://localhost", viewer = owner) =>
  new Request("http://localhost/api/automation-flows", {
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
  m.repo.mockReturnValue({ snapshot: m.snapshot, command: m.command });
  m.snapshot.mockResolvedValue({ viewer_id: owner, flows: [], events: [] });
  m.command.mockResolvedValue({ flow: null, deleted_id: id });
});
it("rejects cross-origin mutations, changed accounts and anonymous sessions", async () => {
  expect((await POST(req({}, "https://other.example"))).status).toBe(403);
  expect((await POST(req({}, "http://localhost", id))).status).toBe(409);
  m.auth.mockResolvedValue({
    data: { user: { id: owner, is_anonymous: true } },
  });
  expect(
    (await GET(new Request("http://localhost/api/automation-flows"))).status,
  ).toBe(401);
  expect(m.repo).not.toHaveBeenCalled();
});
it("returns private owner-scoped snapshots/history and rejects invalid query views", async () => {
  const response = await GET(
    new Request(`http://localhost/api/automation-flows?id=${id}&history=true`),
  );
  expect(response.status).toBe(200);
  expect(m.snapshot).toHaveBeenCalledWith(id, true);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(
    (await GET(new Request("http://localhost/api/automation-flows?id=bad")))
      .status,
  ).toBe(400);
  expect(
    (
      await GET(
        new Request("http://localhost/api/automation-flows?user_id=foreign"),
      )
    ).status,
  ).toBe(400);
});
it("requires explicit exact review and rejects forged ownership fields", async () => {
  expect(
    (
      await POST(
        req({
          operation: "enable",
          id,
          revision: 1,
          digest: "a".repeat(64),
          actor_id: "12345",
          actor_type: "personal",
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (await POST(req({ operation: "delete", id, revision: 1, user_id: owner })))
      .status,
  ).toBe(400);
  expect(
    (await POST(req({ operation: "delete", id, revision: 1 }))).status,
  ).toBe(200);
  expect(m.command).toHaveBeenCalledWith(id, 1, "delete", {});
});
it.each([
  ["42501", 403],
  ["PT409", 409],
  ["55000", 409],
  ["22023", 400],
  ["42P01", 503],
])("redacts automation storage failures %s", async (code, status) => {
  m.command.mockRejectedValue({ code, message: "private database details" });
  const response = await POST(req({ operation: "pause", id, revision: 1 }));
  expect(response.status).toBe(status);
  expect(await response.text()).not.toContain("private database");
});

it("refuses mismatched snapshot owners instead of returning their data", async () => {
  m.snapshot.mockResolvedValue({ viewer_id: id, flows: [], events: [] });
  const response = await GET(
    new Request("http://localhost/api/automation-flows"),
  );
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain(id);
});
