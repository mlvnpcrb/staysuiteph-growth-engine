import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { URL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, expect } from "@playwright/test";

const requireDb = createRequire(
  new URL("../packages/database/package.json", import.meta.url),
);
const { createClient } = requireDb("@supabase/supabase-js");
const requireWeb = createRequire(
  new URL("../apps/web/package.json", import.meta.url),
);
const origin = "http://127.0.0.1:3020";
let stage = "local Supabase availability";

async function main() {
  let status;
  try {
    // Local ephemeral credentials stay in memory. Never print this JSON or put it in an artifact.
    status = JSON.parse(
      execFileSync("./node_modules/.bin/supabase", ["status", "-o", "json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  } catch {
    console.error(
      "BLOCKED: local Supabase is not running. This integration test requires the CI test stack.",
    );
    process.exitCode = 2;
    return;
  }
  const api = new URL(status.API_URL);
  assert.ok(
    ["127.0.0.1", "localhost"].includes(api.hostname),
    "Only disposable loopback Supabase stacks are permitted",
  );
  assert.ok(
    status.ANON_KEY && status.SERVICE_ROLE_KEY,
    "Local test keys are missing",
  );
  const options = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  };
  const admin = createClient(api.origin, status.SERVICE_ROLE_KEY, options);
  const accounts = [];
  let server, browser;
  try {
    stage = "real signup/login";
    const clients = [];
    // Keep disposable passwords below bcrypt's 72-byte limit.
    const password = `StaySuite!${randomUUID()}`;
    assert.ok(Buffer.byteLength(password, "utf8") <= 72);
    for (let i = 0; i < 2; i++) {
      const client = createClient(api.origin, status.ANON_KEY, options);
      const email = `staysuite-qa-${randomUUID()}@example.com`;
      stage = "real signup";
      const signup = await client.auth.signUp({ email, password });
      assert.ok(!signup.error && signup.data.user, "Signup failed");
      accounts.push(signup.data.user.id);
      stage = "real password login";
      const login = await client.auth.signInWithPassword({ email, password });
      assert.ok(!login.error && login.data.session, "Login failed");
      clients.push({ client, email, session: login.data.session });
    }
    console.log("PASS: real Supabase signup and password login");
    const [a, b] = clients;
    stage = "real PostgREST isolation";
    for (let i = 0; i < clients.length; i++) {
      const result = await clients[i].client
        .from("profiles")
        .insert({ id: accounts[i], display_name: `QA Host ${i}` });
      assert.equal(result.error, null);
    }
    assert.deepEqual((await a.client.from("profiles").select("id")).data, [
      { id: accounts[0] },
    ]);
    const crossWrite = await a.client
      .from("profiles")
      .update({ display_name: "forged" })
      .eq("id", accounts[1])
      .select("id");
    assert.equal(crossWrite.error, null);
    assert.deepEqual(crossWrite.data, []);
    assert.equal(
      (
        await a.client
          .from("profiles")
          .update({ created_at: new Date().toISOString() })
          .eq("id", accounts[0])
      ).error?.code,
      "42501",
    );
    assert.deepEqual((await b.client.from("profiles").select("id")).data, [
      { id: accounts[1] },
    ]);
    const anonymous = createClient(api.origin, status.ANON_KEY, options);
    assert.equal(
      (await anonymous.from("profiles").select("id")).error?.code,
      "42501",
    );
    console.log(
      "PASS: real PostgREST owner isolation and column/anonymous denial",
    );

    stage = "application startup";
    server = spawn(
      process.execPath,
      [
        requireWeb.resolve("next/dist/bin/next"),
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3020",
      ],
      {
        cwd: new URL("../apps/web", import.meta.url),
        stdio: "ignore",
        env: {
          ...process.env,
          STAYSUITE_DEMO_MODE: "false",
          NEXT_PUBLIC_SUPABASE_URL: api.origin,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
        },
      },
    );
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (server.exitCode !== null) break;
      try {
        ready = (
          await fetch(`${origin}/login`, { signal: AbortSignal.timeout(2000) })
        ).ok;
      } catch {
        /* wait for local server */
      }
      if (ready) break;
      await delay(500);
    }
    assert.ok(ready, "Next.js test server did not become ready");
    stage = "live API authentication";
    assert.equal((await fetch(`${origin}/api/v1/sync`)).status, 401);
    assert.equal(
      (
        await fetch(`${origin}/api/v1/sync`, {
          headers: { Authorization: "Bearer invalid-token" },
        })
      ).status,
      401,
    );
    const synced = await fetch(`${origin}/api/v1/sync?userId=${accounts[1]}`, {
      headers: { Authorization: `Bearer ${a.session.access_token}` },
    });
    assert.equal(synced.status, 200);
    const snapshot = await synced.json();
    assert.equal(snapshot.userId, accounts[0]);
    assert.equal(snapshot.integration, "not_connected");
    console.log(
      "PASS: live sync token validation, caller identity rejection and unauthenticated denial",
    );

    stage = "browser dashboard login";
    browser = await chromium.launch(
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
        : {},
    );
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${origin}/dashboard/overview`);
    await expect(page).toHaveURL(`${origin}/login`);
    await page.getByLabel("Email", { exact: true }).fill(a.email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(`${origin}/dashboard/overview`, {
      timeout: 15000,
    });
    await expect(
      page.getByRole("heading", { name: "Make room for growth." }),
    ).toBeVisible();
    await expect(page.getByText("Demo workspace", { exact: true })).toHaveCount(
      0,
    );
    console.log(
      "PASS: real dashboard form login, protected route and non-demo session",
    );

    async function storedSession() {
      const chunks = (await context.cookies(origin)).filter((cookie) =>
        cookie.name.includes("-auth-token"),
      );
      chunks.sort((x, y) =>
        x.name.localeCompare(y.name, undefined, { numeric: true }),
      );
      const value = chunks.map((cookie) => cookie.value).join("");
      assert.ok(value, "Session cookies are missing");
      return JSON.parse(
        value.startsWith("base64-")
          ? Buffer.from(value.slice(7), "base64url").toString("utf8")
          : value,
      );
    }
    stage = "automatic SSR refresh";
    const initial = await storedSession();
    assert.ok(
      initial.expires_at * 1000 - Date.now() <= 180000,
      "Use the CI stack with short-lived test JWTs",
    );
    let refreshed;
    const deadline = Date.now() + 160000;
    while (Date.now() < deadline) {
      await delay(5000);
      await page.goto(`${origin}/dashboard/overview`);
      await expect(
        page.getByRole("heading", { name: "Make room for growth." }),
      ).toBeVisible();
      const current = await storedSession();
      if (current.refresh_token !== initial.refresh_token) {
        refreshed = current;
        break;
      }
    }
    assert.ok(refreshed, "Proxy did not persist a rotated refresh token");
    console.log(
      "PASS: automatic server-side session refresh persisted a rotated cookie",
    );

    stage = "real dashboard logout";
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(`${origin}/login`, { timeout: 15000 });
    await page.goto(`${origin}/dashboard/overview`);
    await expect(page).toHaveURL(`${origin}/login`);
    assert.equal(
      (await context.cookies(origin)).filter((cookie) =>
        cookie.name.includes("-auth-token"),
      ).length,
      0,
    );
    assert.ok(
      (
        await a.client.auth.refreshSession({
          refresh_token: refreshed.refresh_token,
        })
      ).error,
      "Revoked refresh token was accepted",
    );
    console.log(
      "PASS: dashboard logout, cookie removal, protected-route denial and refresh revocation",
    );
  } finally {
    await browser?.close();
    server?.kill("SIGTERM");
    for (const id of accounts) {
      const result = await admin.auth.admin.deleteUser(id);
      if (result.error) {
        console.error("FAIL: disposable test account cleanup");
        process.exitCode = 1;
      }
    }
  }
}
main().catch(() => {
  // Never log assertions/SDK/Playwright errors that could contain test credentials.
  console.error(
    `::error title=Live Supabase check failed::Stage: ${stage}. No credential-bearing details are printed.`,
  );
  process.exitCode = 1;
});
