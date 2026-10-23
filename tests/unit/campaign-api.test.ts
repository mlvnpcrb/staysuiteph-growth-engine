import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  env: vi.fn(),
  client: vi.fn(),
  getUser: vi.fn(),
  repo: vi.fn(),
  list: vi.fn(),
  command: vi.fn(),
  signed: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ environment: mocks.env }));
vi.mock("@/lib/supabase", () => ({ supabaseServer: mocks.client }));
vi.mock("@staysuite/database", () => ({ campaignRepository: mocks.repo }));
import { GET, POST, DELETE } from "../../apps/web/src/app/api/campaigns/route";
const owner = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222";
const req = (body: unknown, origin = "http://localhost", viewer?: string) =>
  new Request("http://localhost/api/campaigns", {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      ...(viewer ? { "x-staysuite-viewer": viewer } : {}),
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.env.mockReturnValue({ configured: true });
  mocks.client.mockResolvedValue({
    auth: { getUser: mocks.getUser },
    storage: { from: () => ({ createSignedUploadUrl: mocks.signed }) },
  });
  mocks.getUser.mockResolvedValue({
    data: { user: { id: owner } },
    error: null,
  });
  mocks.repo.mockReturnValue({ list: mocks.list, command: mocks.command });
});
it("denies unauthenticated and anonymous users before repository calls", async () => {
  for (const user of [null, { id: owner, is_anonymous: true }]) {
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    expect((await POST(req({}))).status).toBe(401);
  }
  expect(mocks.repo).not.toHaveBeenCalled();
});
it("rejects cross-origin and switched-viewer mutations", async () => {
  expect((await POST(req({}, "https://other.test"))).status).toBe(403);
  expect((await POST(req({}, "http://localhost", id))).status).toBe(409);
  expect(mocks.repo).not.toHaveBeenCalled();
});
it("returns owner-filtered summaries without enabling publishing", async () => {
  mocks.list.mockResolvedValue([]);
  const result = await GET(new Request("http://localhost/api/campaigns"));
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({
    campaigns: [],
    viewer_id: owner,
    publishing_available: false,
  });
  expect(result.headers.get("cache-control")).toContain("no-store");
  expect(mocks.repo).toHaveBeenCalledWith(expect.anything(), owner);
});
it("rejects forged command payloads and arbitrary receipt states", async () => {
  for (const body of [
    {
      id,
      revision: 1,
      command: "start",
      payload: { actor_id: "12345", actor_type: "personal", user_id: owner },
    },
    {
      id,
      revision: 1,
      command: "report",
      payload: { attempt_token: id, outcome: "completed" },
    },
  ])
    expect((await POST(req(body))).status).toBe(400);
  expect(mocks.command).not.toHaveBeenCalled();
});
it("reports stale revisions, missing setup and disabled adapters without leaking database errors", async () => {
  for (const [code, status] of [
    ["PT409", 409],
    ["PGRST202", 503],
    ["55000", 409],
    ["42501", 403],
  ] as const) {
    mocks.command.mockRejectedValue({
      code,
      message: "secret database details",
    });
    const response = await POST(
      req({ id, revision: 1, command: "cancel", payload: {} }),
    );
    expect(response.status).toBe(status);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  }
});
it("bounds request size before parsing commands", async () => {
  expect((await POST(req({ text: "x".repeat(65000) }))).status).toBe(413);
  expect(mocks.command).not.toHaveBeenCalled();
});
it("signs uploads only for the reserved asset from the owned command result", async () => {
  mocks.command.mockResolvedValue({
    id,
    media: [{ id: owner, position: 0, object_path: `${owner}/${id}/asset` }],
  });
  mocks.signed.mockResolvedValue({
    data: {
      path: `${owner}/${id}/asset`,
      token: "fixture-only",
      signedUrl: "https://fixture.example/upload",
    },
    error: null,
  });
  const response = await POST(
    req({
      id,
      revision: 1,
      command: "reserve_media",
      payload: { position: 0 },
    }),
  );
  expect(response.status).toBe(200);
  expect(mocks.signed).toHaveBeenCalledWith(`${owner}/${id}/asset`);
});

it("rejects malformed deletion payloads without touching storage", async () => {
  const response = await DELETE(
    new Request("http://localhost/api/campaigns", {
      method: "DELETE",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
      },
      body: "{",
    }),
  );
  expect(response.status).toBe(400);
  expect(mocks.command).not.toHaveBeenCalled();
  expect((await DELETE(req({}, "https://foreign.test"))).status).toBe(403);
});
