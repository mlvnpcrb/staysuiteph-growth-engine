import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  env: vi.fn(),
  client: vi.fn(),
  auth: vi.fn(),
  repo: vi.fn(),
  prepare: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ environment: m.env }));
vi.mock("@/lib/supabase", () => ({ supabaseServer: m.client }));
vi.mock("@staysuite/database", () => ({ automationFlowRepository: m.repo }));
import { POST } from "../../apps/web/src/app/api/automation-flows/prepare/route";
const owner = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222";
const input = () => ({
  request_id: id,
  template_id: id,
  template_revision: 1,
  group_ids: [id],
  actor_id: "12345",
  actor_type: "personal",
  interval_minutes: 1,
  settings: { method: "direct" },
});
const request = (
  body: unknown = input(),
  origin = "http://localhost",
  viewer = owner,
) =>
  new Request("http://localhost/api/automation-flows/prepare", {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "x-staysuite-viewer": viewer,
    },
    body: JSON.stringify(body),
  });
const fixture = () => ({
  viewer_id: owner,
  prepared: {
    request_id: id,
    campaign_id: id,
    template_id: id,
    template_revision: 1,
    request_hash: "private",
  },
  job: {
    id,
    user_id: owner,
    actor_id: "12345",
    actor_type: "personal",
    title: "Fixture",
    description: "",
    plan: {
      version: 1,
      text: "Exact body",
      media: [],
      groupIds: [id],
      intervalMinutes: 1,
    },
    settings: { method: "direct" },
    state: "draft",
    revision: 1,
    approved_digest: null,
    digest: "a".repeat(64),
    next_eligible_at: new Date().toISOString(),
    stop_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    targets: [],
    media: [],
  },
});
beforeEach(() => {
  vi.resetAllMocks();
  m.env.mockReturnValue({ configured: true });
  m.client.mockResolvedValue({ auth: { getUser: m.auth } });
  m.auth.mockResolvedValue({ data: { user: { id: owner } } });
  m.repo.mockReturnValue({ prepare: m.prepare });
  m.prepare.mockResolvedValue(fixture());
});
it("pins the session owner, rejects cross-origin requests and anonymous sessions", async () => {
  expect((await POST(request(input(), "https://other.example"))).status).toBe(
    403,
  );
  expect((await POST(request(input(), "http://localhost", id))).status).toBe(
    409,
  );
  m.auth.mockResolvedValue({
    data: { user: { id: owner, is_anonymous: true } },
  });
  expect((await POST(request())).status).toBe(401);
  expect(m.prepare).not.toHaveBeenCalled();
});
it("accepts only a versioned template selection and returns a private minimal prepared result", async () => {
  expect((await POST(request({ ...input(), user_id: owner }))).status).toBe(
    400,
  );
  expect(
    (await POST(request({ ...input(), group_ids: [id, id] }))).status,
  ).toBe(400);
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect((await response.json()).prepared.request_hash).toBeUndefined();
  expect(m.prepare).toHaveBeenCalledWith(
    expect.objectContaining({
      request_id: id,
      settings: expect.objectContaining({ method: "direct", pauseEvery: 1 }),
    }),
  );
});
it("refuses incomplete, oversized and changed-owner responses", async () => {
  const malformed = new Request(
    "http://localhost/api/automation-flows/prepare",
    { method: "POST", headers: { origin: "http://localhost" }, body: "{" },
  );
  expect((await POST(malformed)).status).toBe(400);
  expect((await POST(request({ text: "界".repeat(22000) }))).status).toBe(413);
  m.prepare.mockResolvedValue({ ...fixture(), viewer_id: id });
  expect((await POST(request())).status).toBe(503);
});
it.each([
  ["42501", 403],
  ["PT409", 409],
  ["55000", 409],
  ["22023", 400],
  ["42P01", 503],
])("redacts preparation failure %s", async (code, status) => {
  m.prepare.mockRejectedValue({ code, message: "private storage details" });
  const response = await POST(request());
  expect(response.status).toBe(status);
  expect(await response.text()).not.toContain("private storage");
});
