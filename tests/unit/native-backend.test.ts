import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  create: vi.fn(),
  getUser: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("../../apps/extension/lib/native-auth-client", () => ({
  createClient: m.create,
}));
const owner = "11111111-1111-4111-8111-111111111111";
let values: Record<string, unknown>;
const level = vi.fn(),
  permission = vi.fn();
let backend: typeof import("../../apps/extension/lib/native-backend");
beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  values = {};
  permission.mockResolvedValue(true);
  level.mockResolvedValue(undefined);
  m.getUser.mockResolvedValue({
    data: {
      user: { id: owner, email: "fixture@example.test", is_anonymous: false },
    },
    error: null,
  });
  m.signIn.mockResolvedValue({
    data: {
      session: {
        access_token: "fixture-private-access",
        refresh_token: "fixture-private-refresh",
      },
    },
    error: null,
  });
  m.signOut.mockResolvedValue({ error: null });
  m.rpc.mockResolvedValue({ data: true, error: null });
  m.create.mockReturnValue({
    auth: {
      getUser: m.getUser,
      signInWithPassword: m.signIn,
      signOut: m.signOut,
    },
    rpc: m.rpc,
  });
  vi.stubGlobal("chrome", {
    permissions: { contains: permission },
    storage: {
      local: {
        setAccessLevel: level,
        get: async (key: string) => ({ [key]: values[key] }),
        set: async (next: Record<string, unknown>) =>
          Object.assign(values, next),
        remove: async (key: string) => {
          delete values[key];
        },
      },
    },
  });
  backend = await import("../../apps/extension/lib/native-backend");
});
afterEach(() => vi.unstubAllGlobals());
it("keeps account session storage restricted to trusted extension contexts", async () => {
  await backend.nativeClient();
  expect(level).toHaveBeenCalledWith({ accessLevel: "TRUSTED_CONTEXTS" });
  const options = m.create.mock.calls[0]![2];
  expect(options.auth).toMatchObject({
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  });
  await options.auth.storage.setItem("fixture-session", "private fixture");
  expect(await options.auth.storage.getItem("fixture-session")).toBe(
    "private fixture",
  );
  await options.auth.storage.removeItem("fixture-session");
  expect(await options.auth.storage.getItem("fixture-session")).toBeNull();
});
it("requires the optional account host grant before creating an authenticated client", async () => {
  permission.mockResolvedValue(false);
  await expect(backend.nativeClient()).rejects.toThrow(
    "Allow StaySuite account access",
  );
  expect(m.create).not.toHaveBeenCalled();
});
it("signs in with StaySuite credentials and returns no access or refresh tokens to the UI", async () => {
  const result = await backend.nativeSignIn(
    "fixture@example.test",
    "fixture password",
  );
  expect(m.signIn).toHaveBeenCalledWith({
    email: "fixture@example.test",
    password: "fixture password",
  });
  expect(result).toEqual({ id: owner, email: "fixture@example.test" });
  expect(JSON.stringify(result)).not.toContain("token");
});
it("fails closed for failed sign-in and anonymous accounts without exposing provider diagnostics", async () => {
  m.signIn.mockResolvedValueOnce({
    error: { message: "private provider detail" },
  });
  await expect(
    backend.nativeSignIn("fixture@example.test", "wrong fixture"),
  ).rejects.toThrow("Check your StaySuite email and password");
  m.getUser.mockResolvedValueOnce({
    data: { user: { id: owner, is_anonymous: true } },
    error: null,
  });
  await expect(backend.nativeUser()).rejects.toThrow("Sign in");
});
it("uses the authenticated backend directly without a dashboard tab", async () => {
  const result = await backend.nativeRequest(
    "/api/campaigns/publisher?actor_id=12345&method=direct",
    "GET",
    undefined,
    owner,
  );
  expect(result.status).toBe(200);
  expect(JSON.parse(result.body)).toMatchObject({
    viewer_id: owner,
    direct: true,
  });
  expect(m.rpc).toHaveBeenCalledWith("campaign_direct_publisher_ready", {
    p_actor_id: "12345",
  });
  expect(JSON.stringify(result)).not.toContain("fixture-private");
});
it("rejects a different owner before any domain operation", async () => {
  await expect(
    backend.nativeRequest(
      "/api/campaigns/publisher?actor_id=12345&method=direct",
      "GET",
      undefined,
      "22222222-2222-4222-8222-222222222222",
    ),
  ).rejects.toThrow("account changed");
  expect(m.rpc).not.toHaveBeenCalled();
});
it.each([
  "https://other.example/api/groups",
  "//other.example/api/groups",
  "/api/v1/sync",
  "/api/unknown",
  "/api/groups/../../unknown",
])("rejects unsupported transport destinations %s", async (path) => {
  await expect(
    backend.nativeRequest(path, "GET", undefined, owner),
  ).rejects.toThrow("Unsupported extension request");
  expect(m.rpc).not.toHaveBeenCalled();
});
it("does not sign out other device sessions", async () => {
  await backend.nativeSignOut();
  expect(m.signOut).toHaveBeenCalledWith({ scope: "local" });
});
