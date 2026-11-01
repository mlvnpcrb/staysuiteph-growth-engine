import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  env: vi.fn(),
  client: vi.fn(),
  auth: vi.fn(),
  repo: vi.fn(),
  settings: vi.fn(),
  leads: vi.fn(),
  command: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ environment: m.env }));
vi.mock("@/lib/supabase", () => ({ supabaseServer: m.client }));
vi.mock("@staysuite/database", () => ({ radarRepository: m.repo }));
import { GET, POST } from "../../apps/web/src/app/api/radar/route";
const owner = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222",
  scope = "personal:12345";
const req = (body: unknown, origin = "http://localhost", viewer = owner) =>
  new Request("http://localhost/api/radar", {
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
  m.repo.mockReturnValue({
    settings: m.settings,
    leads: m.leads,
    command: m.command,
  });
  m.settings.mockResolvedValue(null);
  m.leads.mockResolvedValue([]);
  m.command.mockResolvedValue({ deleted: 0 });
});
it("rejects foreign origins, account changes and anonymous sessions", async () => {
  expect((await POST(req({}, "https://other.example"))).status).toBe(403);
  expect((await POST(req({}, "http://localhost", other))).status).toBe(409);
  m.auth.mockResolvedValue({
    data: { user: { id: owner, is_anonymous: true } },
  });
  expect(
    (await GET(new Request(`http://localhost/api/radar?scope=${scope}`)))
      .status,
  ).toBe(401);
  expect(m.repo).not.toHaveBeenCalled();
});
it("returns a scoped private inbox with unavailable capabilities explicitly false", async () => {
  const response = await GET(
    new Request(`http://localhost/api/radar?scope=${scope}`),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toMatchObject({
    viewer_id: owner,
    scope,
    leads: [],
    settings: null,
    capabilities: {
      scanning: false,
      ai: false,
      auto_reply: false,
      webhooks: false,
    },
  });
  expect(m.repo).toHaveBeenCalledWith(expect.anything(), owner);
  expect(m.settings).toHaveBeenCalledWith(scope);
});
it("rejects invalid cursors, unknown parameters and fabricated ownership fields", async () => {
  expect(
    (
      await GET(
        new Request(`http://localhost/api/radar?scope=${scope}&cursor=garbage`),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await GET(
        new Request(
          `http://localhost/api/radar?scope=${scope}&user_id=${other}`,
        ),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await POST(
        req({
          operation: "clear",
          scope,
          before: new Date().toISOString(),
          user_id: other,
        }),
      )
    ).status,
  ).toBe(400);
  expect(m.command).not.toHaveBeenCalled();
});
it("forwards only validated scope and clear cutoff", async () => {
  const before = new Date().toISOString();
  expect((await POST(req({ operation: "clear", scope, before }))).status).toBe(
    200,
  );
  expect(m.command).toHaveBeenCalledWith(scope, 0, "clear", { before });
});
it.each([
  ["42501", 403],
  ["PT409", 409],
  ["23505", 409],
  ["23514", 400],
  ["42P01", 503],
])("redacts storage failures %s", async (code, status) => {
  m.command.mockRejectedValue({ code, message: "private database details" });
  const response = await POST(
    req({ operation: "clear", scope, before: new Date().toISOString() }),
  );
  expect(response.status).toBe(status);
  expect(await response.text()).not.toContain("private database");
});
