import { afterEach, expect, it, vi } from "vitest";
afterEach(() => vi.unstubAllGlobals());
import { serverDatabase } from "@staysuite/database";
it("the installed SSR SDK generates S256 PKCE and persists a verifier cookie without network access", async () => {
  const jar = new Map<string, string>();
  const client = serverDatabase(
    "https://project.supabase.co",
    "sb_publishable_test_fixture",
    {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (values) => {
        for (const { name, value } of values) jar.set(name, value);
      },
    },
  );
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: "http://localhost:3000/auth/callback",
      skipBrowserRedirect: true,
    },
  });
  expect(error).toBeNull();
  const url = new URL(data.url!);
  expect(url.searchParams.get("code_challenge_method")).toBe("s256");
  expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect([...jar.keys()].some((name) => name.includes("code-verifier"))).toBe(
    true,
  );
  expect(url.searchParams.has("code_verifier")).toBe(false);
});

it("reproduces a missing verifier when the callback uses a different host-only cookie jar", async () => {
  const network = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", network);
  const hostA = new Map<string, string>();
  const writes: Array<{
    options: {
      domain?: string;
      path?: string;
      sameSite?: string | boolean;
      httpOnly?: boolean;
      secure?: boolean;
      maxAge?: number;
    };
  }> = [];
  const start = serverDatabase(
    "https://project.supabase.co",
    "sb_publishable_test_fixture",
    {
      getAll: () => [...hostA].map(([name, value]) => ({ name, value })),
      setAll: (values) => {
        for (const cookie of values) {
          hostA.set(cookie.name, cookie.value);
          writes.push(cookie);
        }
      },
    },
  );
  await start.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: "https://preview-b.example/auth/callback",
      skipBrowserRedirect: true,
    },
  });
  expect(hostA.size > 0).toBe(true);
  expect(
    writes.every(
      ({ options }) =>
        options.domain === undefined &&
        options.path === "/" &&
        options.sameSite === "lax",
    ),
  ).toBe(true);
  // These are the installed SSR defaults, not invented secure/httpOnly flags.
  expect(
    writes.every(
      ({ options }) =>
        options.httpOnly === false &&
        options.secure === undefined &&
        Boolean(options.maxAge),
    ),
  ).toBe(true);
  const callback = serverDatabase(
    "https://project.supabase.co",
    "sb_publishable_test_fixture",
    {
      getAll: () => [], // Browser does not send host A's cookie to host B.
      setAll: () => {},
    },
  );
  const { error } = await callback.auth.exchangeCodeForSession("fixture-code");
  expect(error?.code === "pkce_code_verifier_not_found").toBe(true);
  expect(network).not.toHaveBeenCalled();
});

it("exchanges on the same cookie jar and persists a session with the real SSR SDK and mocked token endpoint", async () => {
  const payload = Buffer.from(
    JSON.stringify({
      sub: "11111111-1111-4111-8111-111111111111",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url");
  const network = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.fixture-signature`,
        refresh_token: "fixture-refresh-token",
        token_type: "bearer",
        expires_in: 3600,
        user: {
          id: "11111111-1111-4111-8111-111111111111",
          aud: "authenticated",
          app_metadata: {},
          user_metadata: {},
          created_at: "2026-10-22T00:00:00Z",
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  vi.stubGlobal("fetch", network);
  const jar = new Map<string, string>();
  const cookies = {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (
      values: Parameters<
        NonNullable<Parameters<typeof serverDatabase>[2]["setAll"]>
      >[0],
    ) => {
      for (const { name, value, options } of values) {
        if (options.maxAge === 0) jar.delete(name);
        else jar.set(name, value);
      }
    },
  };
  const start = serverDatabase(
    "https://project.supabase.co",
    "sb_publishable_test_fixture",
    cookies,
  );
  await start.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: "https://preview-a.example/auth/callback",
      skipBrowserRedirect: true,
    },
  });
  const callback = serverDatabase(
    "https://project.supabase.co",
    "sb_publishable_test_fixture",
    cookies,
  );
  const { data, error } =
    await callback.auth.exchangeCodeForSession("fixture-code");
  expect(error === null).toBe(true);
  expect(Boolean(data.session)).toBe(true);
  expect(network).toHaveBeenCalledOnce();
  const body = JSON.parse(String(network.mock.calls[0]![1]?.body));
  expect(
    body.auth_code === "fixture-code" &&
      typeof body.code_verifier === "string" &&
      body.code_verifier.length > 0,
  ).toBe(true);
  expect([...jar.keys()].some((name) => name.endsWith("auth-token"))).toBe(
    true,
  );
  expect([...jar.keys()].some((name) => name.includes("code-verifier"))).toBe(
    false,
  );
});
