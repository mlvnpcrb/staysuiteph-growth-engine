import { expect, it } from "vitest";
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
