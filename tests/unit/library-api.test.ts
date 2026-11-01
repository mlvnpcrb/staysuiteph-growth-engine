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
vi.mock("@staysuite/database", () => ({ libraryRepository: m.repo }));
import { GET, POST } from "../../apps/web/src/app/api/library/route";
const owner = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const req = (body: unknown, origin = "http://localhost", viewer = owner) =>
  new Request("http://localhost/api/library", {
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
  m.snapshot.mockResolvedValue({
    viewer_id: owner,
    categories: [],
    collections: [],
    assignments: [],
  });
  m.command.mockResolvedValue({
    snapshot: {
      viewer_id: owner,
      categories: [],
      collections: [],
      assignments: [],
    },
    template: null,
  });
});
it("rejects foreign origins, account switches and anonymous sessions", async () => {
  expect((await POST(req({}, "https://other.example"))).status).toBe(403);
  expect((await POST(req({}, "http://localhost", other))).status).toBe(409);
  m.auth.mockResolvedValue({
    data: { user: { id: owner, is_anonymous: true } },
  });
  expect((await GET(new Request("http://localhost/api/library"))).status).toBe(
    401,
  );
  expect(m.repo).not.toHaveBeenCalled();
});
it("returns validated private snapshot without caching", async () => {
  const response = await GET(new Request("http://localhost/api/library"));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it("accepts only exact commands and supplies generated creation identity", async () => {
  expect(
    (
      await POST(
        req({ operation: "category_create", name: "Holiday", user_id: other }),
      )
    ).status,
  ).toBe(400);
  expect(
    (await POST(req({ operation: "category_create", name: "Holiday" }))).status,
  ).toBe(200);
  expect(m.command).toHaveBeenCalledWith(
    expect.any(String),
    0,
    "category_create",
    { name: "Holiday" },
  );
});
it.each([
  ["42501", 403],
  ["PT409", 409],
  ["23505", 409],
  ["23514", 400],
  ["42P01", 503],
])("redacts library errors %s", async (code, status) => {
  m.command.mockRejectedValue({ code, message: "secret database details" });
  const response = await POST(
    req({ operation: "category_create", name: "Holiday" }),
  );
  expect(response.status).toBe(status);
  expect(await response.text()).not.toContain("secret database");
});
