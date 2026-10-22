import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ exchange: vi.fn(), environment: vi.fn() }));
vi.mock("@/lib/env", () => ({ environment: mocks.environment }));
vi.mock("@/lib/supabase", () => ({
  supabaseServer: async () => ({
    auth: { exchangeCodeForSession: mocks.exchange },
  }),
}));
import { GET } from "../../apps/web/src/app/auth/callback/route";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.environment.mockReturnValue({ configured: true });
});
it("exchanges the code and ignores caller supplied redirect destinations", async () => {
  mocks.exchange.mockResolvedValue({ error: null });
  const response = await GET(
    new Request(
      "http://localhost:3000/auth/callback?code=test-code&next=https://evil.example",
    ),
  );
  expect(mocks.exchange).toHaveBeenCalledWith("test-code");
  expect(response.headers.get("location")).toBe(
    "http://localhost:3000/dashboard/overview",
  );
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it.each(["", "?error=access_denied&code=ignored"])(
  "rejects missing code or provider denial %s",
  async (query) => {
    const response = await GET(
      new Request(`http://localhost:3000/auth/callback${query}`),
    );
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?error=callback",
    );
    expect(mocks.exchange).not.toHaveBeenCalled();
  },
);
it.each([false, true])(
  "fails closed on exchange failure (throws=%s)",
  async (throws) => {
    if (throws) mocks.exchange.mockRejectedValue(new Error("sensitive detail"));
    else
      mocks.exchange.mockResolvedValue({
        error: { message: "missing verifier" },
      });
    const response = await GET(
      new Request("http://localhost:3000/auth/callback?code=test-code"),
    );
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?error=callback",
    );
  },
);
