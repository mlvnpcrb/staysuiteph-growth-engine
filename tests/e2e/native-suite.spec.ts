import { test, expect, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { extensionCryptoFixture } from "./helpers/extension-crypto";
const owner = "11111111-1111-4111-8111-111111111111",
  group = "22222222-2222-4222-8222-222222222222",
  target = "33333333-3333-4333-8333-333333333333";
async function fixture(
  context: BrowserContext,
  signedIn = false,
  ready = true,
) {
  await context.addInitScript(extensionCryptoFixture);
  const root = path.resolve("apps/extension/build/chrome-mv3-prod");
  await context.route("http://native-extension.test/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const file = path.resolve(root, "." + pathname);
    if (!file.startsWith(root + path.sep)) return route.abort();
    const type = file.endsWith(".html")
      ? "text/html"
      : file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".woff2")
            ? "font/woff2"
            : "application/octet-stream";
    await route.fulfill({ body: await readFile(file), contentType: type });
  });
  await context.addInitScript(
    ({ owner, group, target, signedIn, ready }) => {
      if (signedIn) localStorage.setItem("native-signed-in", "true");
      let job: Record<string, unknown> | null = null;
      const now = new Date().toISOString();
      const groups = [
        {
          id: group,
          user_id: owner,
          identity: "12345",
          title: "Owner-approved fixture group",
          url: "https://www.facebook.com/groups/12345/",
          destination: "",
          accommodation: "",
          audience: "",
          evidence: "",
          source: "manual",
          notes: "",
          review_status: "reviewed",
          rule_evidence: "Fixture permission",
          last_reviewed_at: now,
          created_at: now,
          updated_at: now,
        },
      ];
      const commands: string[] = [];
      const result = (value: unknown) => ({ ok: true, ...(value as object) });
      const engineStatus = {
        viewer_id: owner,
        actor_id: "12345",
        actor_type: "personal",
        actor_name: "Fixture owner",
        publisher_ready: ready,
        version: "0.6.0",
      };
      const api = (request: {
        path: string;
        method: string;
        body?: string;
        viewer: string;
      }) => {
        if (request.viewer !== owner) throw new Error("Wrong fixture owner");
        let value: unknown;
        const url = new URL(request.path, location.origin);
        if (url.pathname === "/api/groups")
          value = {
            viewer_id: owner,
            groups,
            stats: { total: 1, reviewed: 1, needsReview: 0 },
          };
        else if (url.pathname === "/api/library")
          value = {
            viewer_id: owner,
            categories: [],
            collections: [],
            assignments: [],
          };
        else if (url.pathname === "/api/templates")
          value = { viewer_id: owner, templates: [] };
        else if (url.pathname === "/api/schedules")
          value = { viewer_id: owner, schedules: [], runs: [] };
        else if (url.pathname === "/api/automation-flows")
          value = { viewer_id: owner, flows: [], events: [] };
        else if (url.pathname === "/api/radar")
          value = {
            viewer_id: owner,
            leads: [],
            settings: null,
            scope: "personal:12345",
            capabilities: {
              scanning: false,
              ai: false,
              auto_reply: false,
              webhooks: false,
            },
            next_cursor: null,
            server_time: now,
          };
        else if (url.pathname === "/api/campaigns") {
          if (request.method === "POST") {
            const body = JSON.parse(request.body ?? "{}");
            commands.push(body.command);
            if (body.command === "create")
              job = {
                ...body.payload,
                id: body.id,
                user_id: owner,
                actor_id: null,
                actor_type: "personal",
                state: "draft",
                revision: 1,
                digest: "a".repeat(64),
                approved_digest: null,
                next_eligible_at: now,
                stop_reason: null,
                created_at: now,
                updated_at: now,
                media: [],
                targets: [
                  {
                    id: target,
                    campaign_id: body.id,
                    group_id: group,
                    position: 0,
                    state: "queued",
                    attempt_token: null,
                    lease_until: null,
                    post_url: null,
                    receipt_source: null,
                  },
                ],
              };
            else if (body.command === "bind_actor")
              job = {
                ...job,
                ...body.payload,
                revision: 2,
                digest: "b".repeat(64),
              };
            else throw new Error("Unexpected native UI campaign command");
            value = { viewer_id: owner, job };
          } else
            value = url.searchParams.has("id")
              ? { viewer_id: owner, job, assets: [] }
              : { viewer_id: owner, campaigns: job ? [job] : [] };
        } else throw new Error("Unexpected API: " + request.path);
        return result({
          status: 200,
          content_type: "application/json",
          body: JSON.stringify(value),
        });
      };
      Reflect.set(window, "chrome", {
        runtime: {
          getURL: (value: string) => "http://native-extension.test/" + value,
          sendMessage: async (message: {
            type: string;
            email?: string;
            password?: string;
            input?: unknown;
          }) => {
            if (message.type === "NATIVE_USER")
              return result({
                user:
                  localStorage.getItem("native-signed-in") === "true"
                    ? { id: owner, email: "fixture@example.test" }
                    : null,
              });
            if (message.type === "NATIVE_SIGN_IN") {
              if (
                message.email !== "fixture@example.test" ||
                message.password !== "fixture password"
              )
                return {
                  ok: false,
                  error:
                    "Sign-in failed. Check your StaySuite email and password.",
                };
              localStorage.setItem("native-signed-in", "true");
              return result({
                user: { id: owner, email: "fixture@example.test" },
              });
            }
            if (message.type === "NATIVE_SIGN_OUT") {
              localStorage.removeItem("native-signed-in");
              return result({});
            }
            if (message.type === "NATIVE_ENGINE_STATUS")
              return result({ status: engineStatus });
            if (message.type === "NATIVE_API")
              return api(message as unknown as Parameters<typeof api>[0]);
            if (message.type === "NATIVE_ENGINE_OPEN") {
              localStorage.setItem(
                "native-open-input",
                JSON.stringify(message.input),
              );
              const input = message.input as { request_id: string };
              if (!ready)
                return result({
                  request_id: input.request_id,
                  validation_required: true,
                  input,
                  job,
                });
              job = {
                ...job,
                state: "completed",
                approved_digest: "b".repeat(64),
                targets: [
                  {
                    id: target,
                    campaign_id: job?.id,
                    group_id: group,
                    position: 0,
                    state: "live",
                    attempt_token: null,
                    lease_until: null,
                    receipt_source: "extension_report",
                    post_url:
                      "https://www.facebook.com/groups/12345/posts/67890/",
                  },
                ],
              };
              return result({ request_id: input.request_id });
            }
            if (message.type === "FACEBOOK_STATE")
              return result({ actorId: "12345", library: null });
            throw new Error("Unexpected native message " + message.type);
          },
        },
        permissions: { contains: async () => true, request: async () => true },
        tabs: {
          create: async () => {
            localStorage.setItem("native-created-tab", "true");
            throw new Error("Unexpected tab creation");
          },
          query: async () => [],
        },
      });
      Reflect.set(window, "nativeFixtureCommands", commands);
    },
    { owner, group, target, signedIn, ready },
  );
}
test("extension signs in and out without opening or pairing a dashboard tab", async ({
  context,
  page,
}, testInfo) => {
  await fixture(context);
  await page.goto("http://native-extension.test/popup.html");
  await expect(
    page.getByRole("heading", { name: "Sign in to StaySuite" }),
  ).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("fixture@example.test");
  await page.getByLabel("Password", { exact: true }).fill("wrong fixture");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Sign-in failed");
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await page.getByLabel("Password", { exact: true }).fill("fixture password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Compose", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("fixture@example.test", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Click Connect StaySuite and Facebook/),
  ).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("native-compose.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to StaySuite" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("native-created-tab")),
  ).toBeNull();
});
test("Compose uses native backend messages and starts the background queue without tab creation", async ({
  context,
  page,
}) => {
  await fixture(context, true);
  await page.goto("http://native-extension.test/popup.html");
  await page
    .getByLabel("Post text", { exact: true })
    .fill("Exact extension message");
  await page
    .getByRole("button", { name: "Advanced selector", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: /Owner-approved fixture group/ })
    .check();
  await page
    .getByRole("button", { name: "Done selecting groups", exact: true })
    .click();
  await page.getByRole("button", { name: "Post Now", exact: true }).click();
  await expect(page.locator(".compose-engine-progress")).toContainText(
    "1 of 1 submissions confirmed",
  );
  expect(
    JSON.parse(
      (await page.evaluate(() => localStorage.getItem("native-open-input"))) ??
        "{}",
    ),
  ).toMatchObject({
    actor_id: "12345",
    viewer_id: owner,
    revision: 2,
    digest: "b".repeat(64),
    reviewed: true,
  });
  expect(
    await page.evaluate(() => Reflect.get(window, "nativeFixtureCommands")),
  ).toEqual(["create", "bind_actor"]);
  expect(
    await page.evaluate(() => localStorage.getItem("native-created-tab")),
  ).toBeNull();
  expect(context.pages()).toHaveLength(1);
});
test("unvalidated profiles stay inside the extension for an explicit first posting check", async ({
  context,
  page,
}) => {
  await fixture(context, true, false);
  await page.goto("http://native-extension.test/popup.html");
  await page
    .getByLabel("Post text", { exact: true })
    .fill("Exact extension validation message");
  await page
    .getByRole("button", { name: "Advanced selector", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: /Owner-approved fixture group/ })
    .check();
  await page
    .getByRole("button", { name: "Done selecting groups", exact: true })
    .click();
  await page.getByRole("button", { name: "Post Now", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "First posting check" }),
  ).toBeVisible();
  await expect(
    page.getByText(/First selected group: Owner-approved fixture group/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Publish one validation post" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() => localStorage.getItem("native-created-tab")),
  ).toBeNull();
});

test("all main workspaces load inside the extension", async ({
  context,
  page,
}) => {
  await fixture(context, true);
  await page.goto("http://native-extension.test/popup.html");
  await expect(
    page.getByRole("heading", { name: "Compose", exact: true }),
  ).toBeVisible();
  for (const label of [
    "Templates",
    "Automations",
    "Lead Radar",
    "Activity",
    "All groups",
  ]) {
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: label, exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: label,
        exact: true,
        includeHidden: true,
      }),
    ).toHaveCount(1);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page).toHaveURL(
      /^http:\/\/native-extension\.test\/popup\.html/,
    );
  }
  expect(context.pages()).toHaveLength(1);
});
