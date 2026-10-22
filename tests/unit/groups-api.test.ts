import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  env: vi.fn(),
  client: vi.fn(),
  getUser: vi.fn(),
  repo: vi.fn(),
  list: vi.fn(),
  duplicates: vi.fn(),
  save: vi.fn(),
  find: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ environment: mocks.env }));
vi.mock("@/lib/supabase", () => ({ supabaseServer: mocks.client }));
vi.mock("@staysuite/database", () => ({ groupRepository: mocks.repo }));
import {
  GET,
  POST,
  PATCH,
  DELETE,
} from "../../apps/web/src/app/api/groups/route";
const owner = "11111111-1111-4111-8111-111111111111";
const request = (method: string, body?: unknown, origin = "http://localhost") =>
  new Request("http://localhost/api/groups", {
    method,
    headers: { origin, "content-type": "application/json" },
    ...(body && method !== "GET" ? { body: JSON.stringify(body) } : {}),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.env.mockReturnValue({ configured: true });
  mocks.client.mockResolvedValue({ auth: { getUser: mocks.getUser } });
  mocks.getUser.mockResolvedValue({
    data: { user: { id: owner } },
    error: null,
  });
  mocks.repo.mockReturnValue({
    list: mocks.list,
    duplicates: mocks.duplicates,
    save: mocks.save,
    find: mocks.find,
    update: mocks.update,
    remove: mocks.remove,
  });
});
it.each([GET, POST, PATCH, DELETE])(
  "denies anonymous requests before repository access",
  async (handler) => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(
      (await handler(request(handler === GET ? "GET" : "POST", {}))).status,
    ).toBe(401);
    expect(mocks.repo).not.toHaveBeenCalled();
  },
);
it("rejects cross-origin mutations", async () => {
  expect((await POST(request("POST", {}, "https://evil.test"))).status).toBe(
    403,
  );
  expect(mocks.client).not.toHaveBeenCalled();
});
it("returns persisted groups and exact totals only for verified identity", async () => {
  mocks.list.mockResolvedValue({
    groups: [],
    stats: { total: 0, reviewed: 0, needsReview: 0 },
  });
  const response = await GET(request("GET"));
  expect(response.status).toBe(200);
  expect(mocks.repo).toHaveBeenCalledWith(expect.anything(), owner);
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it("normalizes save and drops forged ownership from payload", async () => {
  mocks.save.mockResolvedValue({ duplicate: false });
  const response = await POST(
    request("POST", {
      url: "https://m.facebook.com/groups/CebuHost/?ref=share",
      title: "Host group",
      destination: "Cebu",
      accommodation: "Condo",
      audience: "Guests",
      user_id: "forged",
    }),
  );
  expect(response.status).toBe(200);
  expect(mocks.save).toHaveBeenCalledWith(
    expect.objectContaining({
      identity: "cebuhost",
      url: "https://www.facebook.com/groups/cebuhost/",
    }),
  );
  expect(mocks.save.mock.calls[0]?.[0]).not.toHaveProperty("user_id");
});
it("returns duplicate feedback without overwriting existing details", async () => {
  mocks.save.mockResolvedValue({ duplicate: true });
  const response = await POST(
    request("POST", {
      url: "https://facebook.com/groups/example",
      title: "Group",
      destination: "Cebu",
      accommodation: "Condo",
      audience: "Hosts",
    }),
  );
  expect((await response.json()).duplicate).toBe(true);
});
it("does not refresh a review date when only notes change", async () => {
  mocks.find.mockResolvedValue({
    review_status: "reviewed",
    rule_evidence: "Existing rule",
    last_reviewed_at: "2026-01-01T00:00:00Z",
  });
  mocks.update.mockResolvedValue({ id: owner });
  expect(
    (
      await PATCH(
        request("PATCH", {
          id: owner,
          notes: "Updated note",
          review_status: "reviewed",
          rule_evidence: "Existing rule",
        }),
      )
    ).status,
  ).toBe(200);
  expect(mocks.update).toHaveBeenCalledWith(
    owner,
    expect.objectContaining({ last_reviewed_at: "2026-01-01T00:00:00Z" }),
  );
});
it("requires explicit confirmation for a new reviewed status", async () => {
  mocks.find.mockResolvedValue({
    review_status: "review_required",
    rule_evidence: "",
    last_reviewed_at: null,
  });
  expect(
    (
      await PATCH(
        request("PATCH", {
          id: owner,
          notes: "",
          review_status: "reviewed",
          rule_evidence: "Some rule",
        }),
      )
    ).status,
  ).toBe(400);
  expect(mocks.update).not.toHaveBeenCalled();
});
it("sets server review time when explicitly confirmed", async () => {
  mocks.find.mockResolvedValue({ review_status: "review_required" });
  mocks.update.mockResolvedValue({ id: owner });
  expect(
    (
      await PATCH(
        request("PATCH", {
          id: owner,
          notes: "",
          review_status: "reviewed",
          rule_evidence: "Some rule",
          confirm_review: true,
          last_reviewed_at: "2099-01-01",
        }),
      )
    ).status,
  ).toBe(200);
  expect(mocks.update).toHaveBeenCalledWith(
    owner,
    expect.objectContaining({ last_reviewed_at: expect.stringMatching(/^20/) }),
  );
  expect(mocks.update.mock.calls[0]?.[1].last_reviewed_at).not.toContain(
    "2099",
  );
});
it("treats unauthorized/missing target as not found", async () => {
  mocks.find.mockResolvedValue(null);
  expect(
    (
      await PATCH(
        request("PATCH", {
          id: owner,
          notes: "",
          review_status: "review_required",
          rule_evidence: "",
        }),
      )
    ).status,
  ).toBe(404);
  mocks.remove.mockResolvedValue(false);
  expect((await DELETE(request("DELETE", { id: owner }))).status).toBe(404);
});
it("reports unavailable persistence without inventing a successful save", async () => {
  mocks.save.mockRejectedValue(new Error("secret backend details"));
  const response = await POST(
    request("POST", {
      url: "https://facebook.com/groups/example",
      title: "Group",
      destination: "Cebu",
      accommodation: "Condo",
      audience: "Hosts",
    }),
  );
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain("secret");
});

it("checks owned duplicates without writing, and accepts name/link-only imports", async () => {
  mocks.duplicates.mockResolvedValue(["one"]);
  expect(
    (
      await POST(
        request("POST", {
          operation: "check_duplicates",
          urls: ["https://facebook.com/groups/ONE/?ref=share"],
        }),
      )
    ).status,
  ).toBe(200);
  expect(mocks.duplicates).toHaveBeenCalledWith(["one"]);
  expect(mocks.save).not.toHaveBeenCalled();
  mocks.save.mockResolvedValue({ duplicate: false });
  expect(
    (
      await POST(
        request("POST", {
          url: "https://facebook.com/groups/two/",
          title: "New group",
        }),
      )
    ).status,
  ).toBe(200);
  expect(mocks.save).toHaveBeenCalledWith(
    expect.objectContaining({
      destination: "",
      accommodation: "",
      audience: "",
    }),
  );
});
it("rejects invalid duplicate URLs without database lookup", async () => {
  expect(
    (
      await POST(
        request("POST", {
          operation: "check_duplicates",
          urls: ["https://evil.test/groups/one/"],
        }),
      )
    ).status,
  ).toBe(400);
  expect(mocks.duplicates).not.toHaveBeenCalled();
});
it("accepts a full 100-link duplicate preview without the smaller single-entry size limit", async () => {
  mocks.duplicates.mockResolvedValue([]);
  const urls = Array.from(
    { length: 100 },
    (_, index) => `https://www.facebook.com/groups/${"g".repeat(150)}${index}/`,
  );
  expect(
    JSON.stringify({ operation: "check_duplicates", urls }).length,
  ).toBeGreaterThan(16000);
  expect(
    (await POST(request("POST", { operation: "check_duplicates", urls })))
      .status,
  ).toBe(200);
  expect(mocks.duplicates.mock.calls[0]?.[0]).toHaveLength(100);
  expect(mocks.save).not.toHaveBeenCalled();
});
