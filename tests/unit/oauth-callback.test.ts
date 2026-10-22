import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthCookieWriteError } from "../../apps/web/src/lib/oauth-diagnostics";
const mocks = vi.hoisted(() => ({
  exchange: vi.fn(),
  environment: vi.fn(),
  client: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ environment: mocks.environment }));
vi.mock("@/lib/supabase", () => ({ supabaseServer: mocks.client }));
import { GET } from "../../apps/web/src/app/auth/callback/route";
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  mocks.environment.mockReturnValue({
    configured: true,
    siteUrl: "http://localhost:3000",
  });
  mocks.client.mockResolvedValue({
    auth: { exchangeCodeForSession: mocks.exchange },
  });
});
afterEach(() => vi.restoreAllMocks());
const request = (
  query = "?code=sensitive-code-sentinel",
  origin = "http://localhost:3000",
) => new Request(`${origin}/auth/callback${query}`);
function expectFailure(
  response: Response,
  category: string,
  origin = "http://localhost:3000",
) {
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe(
    `${origin}/login?error=callback`,
  );
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(console.info).toHaveBeenCalledExactlyOnceWith("[auth]", { category });
}
it("exchanges the code and ignores caller supplied redirect destinations", async () => {
  mocks.exchange.mockResolvedValue({ error: null });
  const response = await GET(
    request("?code=test-code&next=https://evil.example"),
  );
  expect(mocks.exchange).toHaveBeenCalledWith("test-code");
  expect(mocks.client).toHaveBeenCalledWith({ requireCookieWrites: true });
  expect(response.headers.get("location")).toBe(
    "http://localhost:3000/dashboard/overview",
  );
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(console.info).not.toHaveBeenCalled();
});
it.each([
  ["", "callback_missing_code"],
  ["?code=", "callback_missing_code"],
  [
    "?error=access_denied&code=sensitive-code-sentinel&error_description=sensitive-detail",
    "callback_provider_error",
  ],
])(
  "categorizes early callback failure without logging request data",
  async (query, category) => {
    expectFailure(await GET(request(query)), category);
    expect(mocks.client).not.toHaveBeenCalled();
  },
);
it("distinguishes missing backend configuration", async () => {
  mocks.environment.mockReturnValue({ configured: false });
  expectFailure(await GET(request()), "callback_not_configured");
  expect(mocks.exchange).not.toHaveBeenCalled();
});
it("rejects a callback on another Preview without forwarding the code", async () => {
  mocks.environment.mockReturnValue({
    configured: true,
    siteUrl: "https://preview-a.example",
  });
  expectFailure(
    await GET(request(undefined, "https://preview-b.example")),
    "callback_origin_mismatch",
    "https://preview-b.example",
  );
  expect(mocks.client).not.toHaveBeenCalled();
});
it.each([
  ["pkce_code_verifier_not_found", "callback_missing_verifier"],
  ["bad_code_verifier", "callback_verifier_mismatch"],
  ["flow_state_expired", "callback_flow_expired"],
  ["flow_state_not_found", "callback_flow_not_found"],
  ["unrecognized-sensitive-code", "callback_exchange_rejected"],
])("maps SDK code %s to a fixed safe category", async (code, category) => {
  mocks.exchange.mockResolvedValue({
    error: { code, message: "sensitive-message", details: "sensitive-token" },
  });
  expectFailure(await GET(request()), category);
});
it("distinguishes service unavailability", async () => {
  mocks.exchange.mockResolvedValue({
    error: {
      name: "AuthRetryableFetchError",
      status: 503,
      message: "sensitive network details",
    },
  });
  expectFailure(await GET(request()), "callback_auth_unavailable");
});
it("distinguishes cookie persistence errors", async () => {
  mocks.exchange.mockRejectedValue(new AuthCookieWriteError());
  expectFailure(await GET(request()), "callback_cookie_write_failed");
});
it("does not serialize unexpected exceptions, requests or query strings", async () => {
  mocks.exchange.mockRejectedValue(new Error("sensitive-error-message"));
  expectFailure(
    await GET(request("?code=sensitive-code-sentinel&token=sensitive-token")),
    "callback_unexpected_error",
  );
});

it("distinguishes a malformed token response from an Auth outage", async () => {
  mocks.exchange.mockResolvedValue({
    error: { name: "AuthInvalidTokenResponseError", status: 500 },
  });
  expectFailure(await GET(request()), "callback_invalid_token_response");
});
it("rejects missing SITE_URL on the callback deployment", async () => {
  mocks.environment.mockReturnValue({ configured: true });
  expectFailure(await GET(request()), "callback_not_configured");
  expect(mocks.client).not.toHaveBeenCalled();
});
