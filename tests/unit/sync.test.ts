import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  environment: vi.fn(),
  getUser: vi.fn(),
  tokenDatabase: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ environment: mocks.environment }));
vi.mock("@staysuite/database", () => ({ tokenDatabase: mocks.tokenDatabase }));
import { GET } from "../../apps/web/src/app/api/v1/sync/route";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.environment.mockReturnValue({
    url: "https://test.supabase.co",
    key: "public-test-key",
  });
  mocks.tokenDatabase.mockReturnValue({ auth: { getUser: mocks.getUser } });
});
describe("sync boundary with mocked Supabase Auth (not live integration)", () => {
  it("rejects missing credentials before constructing a client", async () => {
    const response = await GET(new Request("http://localhost/api/v1/sync"));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
    expect(mocks.tokenDatabase).not.toHaveBeenCalled();
  });
  it("rejects an invalid token without exposing backend error details", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { status: 401, message: "sensitive backend detail" },
    });
    const response = await GET(
      new Request("http://localhost/api/v1/sync", {
        headers: { authorization: "Bearer invalid-token" },
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });
  it("takes identity only from verified Auth, ignoring caller identity", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
    const response = await GET(
      new Request("http://localhost/api/v1/sync?userId=forged", {
        headers: {
          authorization: "Bearer verified-token",
          "x-user-id": "forged",
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId: "11111111-1111-4111-8111-111111111111",
      serverTime: expect.any(String),
      integration: "not_connected",
    });
    expect(mocks.getUser).toHaveBeenCalledWith("verified-token");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
  it.each([0, 503])("fails closed on Auth outage status %s", async (status) => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { status },
    });
    const response = await GET(
      new Request("http://localhost/api/v1/sync", {
        headers: { authorization: "Bearer token" },
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "backend_unavailable" });
  });
  it("handles unexpected SDK exceptions without leaking credentials", async () => {
    mocks.tokenDatabase.mockImplementation(() => {
      throw new Error("private failure");
    });
    const response = await GET(
      new Request("http://localhost/api/v1/sync", {
        headers: { authorization: "Bearer token" },
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "backend_unavailable" });
  });
});
