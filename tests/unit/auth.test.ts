import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  environment: vi.fn(),
  supabase: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  oauth: vi.fn(),
  headers: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/env", () => ({ environment: mocks.environment }));
vi.mock("@/lib/supabase", () => ({ supabaseServer: mocks.supabase }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
import {
  signIn,
  signOut,
  signInWithGoogle,
} from "../../apps/web/src/app/login/actions";
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  mocks.headers.mockResolvedValue(
    new Headers({ origin: "http://localhost:3000" }),
  );
  mocks.environment.mockReturnValue({
    configured: true,
    siteUrl: "http://localhost:3000",
  });
  mocks.supabase.mockResolvedValue({
    auth: {
      signInWithPassword: mocks.login,
      signOut: mocks.logout,
      signInWithOAuth: mocks.oauth,
    },
  });
});
afterEach(() => vi.restoreAllMocks());
function credentials(
  email = "host@example.com",
  password = "valid-test-password",
) {
  const form = new FormData();
  form.set("email", email);
  form.set("password", password);
  return form;
}
describe("auth actions with mocked SDK (not live auth)", () => {
  it("blocks unconfigured authentication", async () => {
    mocks.environment.mockReturnValue({ configured: false });
    await expect(signIn(credentials())).rejects.toThrow(
      "redirect:/login?error=configuration",
    );
    expect(mocks.supabase).not.toHaveBeenCalled();
  });
  it("rejects invalid input before contacting Auth", async () => {
    await expect(signIn(credentials("not-email", "short"))).rejects.toThrow(
      "redirect:/login?error=invalid",
    );
    expect(mocks.supabase).not.toHaveBeenCalled();
  });
  it("redirects failed login without exposing backend details", async () => {
    mocks.login.mockResolvedValue({ error: { message: "private detail" } });
    await expect(signIn(credentials())).rejects.toThrow(
      "redirect:/login?error=credentials",
    );
  });
  it("redirects successful login only to the dashboard", async () => {
    mocks.login.mockResolvedValue({ error: null });
    const form = credentials();
    form.set("next", "https://evil.example");
    await expect(signIn(form)).rejects.toThrow("redirect:/dashboard/overview");
    expect(mocks.login).toHaveBeenCalledWith({
      email: "host@example.com",
      password: "valid-test-password",
    });
  });
  it("revokes the session before logout navigation", async () => {
    mocks.logout.mockResolvedValue({ error: null });
    await expect(signOut()).rejects.toThrow("redirect:/login");
    expect(mocks.logout).toHaveBeenCalledOnce();
  });
  it("surfaces logout failure instead of implying success", async () => {
    mocks.logout.mockResolvedValue({
      error: { message: "service unavailable" },
    });
    await expect(signOut()).rejects.toThrow("redirect:/login?error=logout");
  });
});

describe("Google OAuth action", () => {
  it("starts Google with the trusted callback and server cookie flow", async () => {
    mocks.oauth.mockResolvedValue({
      data: { url: "https://project.supabase.co/auth/v1/authorize" },
      error: null,
    });
    await expect(signInWithGoogle()).rejects.toThrow(
      "redirect:https://project.supabase.co/auth/v1/authorize",
    );
    expect(mocks.oauth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "http://localhost:3000/auth/callback",
        skipBrowserRedirect: true,
      },
    });
    expect(mocks.supabase).toHaveBeenCalledWith({ requireCookieWrites: true });
  });
  it.each([
    undefined,
    "http://evil.example",
    "https://user:pass@example.com",
    "https://example.com/path",
    "javascript:alert(1)",
  ])("rejects invalid site origin %s", async (siteUrl) => {
    mocks.environment.mockReturnValue({ configured: true, siteUrl });
    await expect(signInWithGoogle()).rejects.toThrow(
      "redirect:/login?error=configuration",
    );
    expect(mocks.supabase).not.toHaveBeenCalled();
  });
  it("hides provider errors", async () => {
    mocks.oauth.mockRejectedValue(new Error("private provider detail"));
    await expect(signInWithGoogle()).rejects.toThrow(
      "redirect:/login?error=oauth",
    );
    expect(console.info).toHaveBeenCalledExactlyOnceWith("[auth]", {
      category: "oauth_start_failed",
    });
  });
  it("moves a different Preview origin to the trusted login before writing any verifier", async () => {
    mocks.environment.mockReturnValue({
      configured: true,
      siteUrl: "https://preview-a.example",
    });
    mocks.headers.mockResolvedValue(
      new Headers({ origin: "https://preview-b.example" }),
    );
    await expect(signInWithGoogle()).rejects.toThrow(
      "redirect:https://preview-a.example/login",
    );
    expect(mocks.supabase).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledExactlyOnceWith("[auth]", {
      category: "oauth_origin_mismatch",
    });
  });
  it("fails closed when the Server Action origin is absent", async () => {
    mocks.headers.mockResolvedValue(new Headers());
    await expect(signInWithGoogle()).rejects.toThrow(
      "redirect:/login?error=configuration",
    );
    expect(mocks.supabase).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledExactlyOnceWith("[auth]", {
      category: "oauth_origin_missing",
    });
  });
});

it("uses the exact configured HTTPS Preview origin for the Google redirect", async () => {
  const origin =
    "https://staysuiteph-growth-engine-ayi4mifww-mlvnpcrbs-projects.vercel.app";
  mocks.environment.mockReturnValue({ configured: true, siteUrl: origin });
  mocks.headers.mockResolvedValue(new Headers({ origin }));
  mocks.oauth.mockResolvedValue({
    data: { url: "https://project.supabase.co/auth/v1/authorize" },
    error: null,
  });
  await expect(signInWithGoogle()).rejects.toThrow(
    "redirect:https://project.supabase.co/auth/v1/authorize",
  );
  expect(mocks.oauth).toHaveBeenCalledWith({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
      skipBrowserRedirect: true,
    },
  });
  expect(console.info).not.toHaveBeenCalled();
});
it("reports verifier-cookie write failure without redirecting to Google", async () => {
  const { AuthCookieWriteError } = await import(
    "../../apps/web/src/lib/oauth-diagnostics"
  );
  mocks.oauth.mockRejectedValue(new AuthCookieWriteError());
  await expect(signInWithGoogle()).rejects.toThrow(
    "redirect:/login?error=oauth",
  );
  expect(console.info).toHaveBeenCalledExactlyOnceWith("[auth]", {
    category: "oauth_cookie_write_failed",
  });
});
