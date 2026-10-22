import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  environment: vi.fn(),
  supabase: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ environment: mocks.environment }));
vi.mock("@/lib/supabase", () => ({ supabaseServer: mocks.supabase }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
import { signIn, signOut } from "../../apps/web/src/app/login/actions";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.environment.mockReturnValue({ configured: true });
  mocks.supabase.mockResolvedValue({
    auth: { signInWithPassword: mocks.login, signOut: mocks.logout },
  });
});
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
