import AxeBuilder from "@axe-core/playwright";
import { test, expect, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
const dashboardOrigin =
  process.env.PLASMO_PUBLIC_DASHBOARD_URL || "http://localhost:3000";
async function servePopup(context: BrowserContext) {
  const directory = resolve("apps/extension/build/chrome-mv3-prod");
  const manifest = JSON.parse(
    await readFile(`${directory}/manifest.json`, "utf8"),
  );
  await context.route("http://extension-fixture.test/**", async (route) => {
    const file =
      basename(new URL(route.request().url()).pathname) || "popup.html";
    const types: Record<string, string> = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".png": "image/png",
    };
    const contentType = types[extname(file)] ?? "application/octet-stream";
    await route.fulfill({
      body: await readFile(`${directory}/${file}`),
      contentType,
      headers: {
        "Content-Security-Policy":
          manifest.content_security_policy.extension_pages,
      },
    });
  });
}
test("built popup renders under its CSP and opens the dashboard (HTTP harness, not an installed extension)", async ({
  context,
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await servePopup(context);
  await context.route(`${dashboardOrigin}/**`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Dashboard destination fixture</h1>",
    }),
  );
  await page.goto("http://extension-fixture.test/popup.html");
  await expect(
    page.getByRole("heading", { name: "Bring your groups to StaySuite." }),
  ).toBeVisible();
  await expect(
    page.getByText(/No background access or publishing/),
  ).toBeVisible();
  await page.getByText("Connection & privacy").click();
  await expect(page.getByText(/Sign in only on your dashboard/)).toBeVisible();
  const opened = context.waitForEvent("page");
  await page.getByRole("button", { name: "Open dashboard" }).click();
  const destination = await opened;
  await expect(destination).toHaveURL(`${dashboardOrigin}/dashboard/my-groups`);
  await expect(
    destination.getByRole("heading", { name: "Dashboard destination fixture" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("popup requires consent, previews selected groups and exports only the selection (mock Chrome API)", async ({
  context,
  page,
}) => {
  await servePopup(context);
  await page.addInitScript(() => {
    Object.defineProperty(window, "chrome", {
      configurable: true,
      value: {
        tabs: { query: async () => [{ id: 1 }] },
        scripting: {
          executeScript: async () => [
            {
              result: {
                format: "staysuite-visible-groups-v1",
                collected_at: "2026-10-22T10:00:00Z",
                groups: [
                  {
                    url: "https://www.facebook.com/groups/fixtureone/",
                    title: "Fixture one",
                  },
                  {
                    url: "https://www.facebook.com/groups/fixturetwo/",
                    title: "Fixture two",
                  },
                ],
              },
            },
          ],
        },
      },
    });
  });
  await page.goto("http://extension-fixture.test/popup.html");
  const collect = page.getByRole("button", { name: "Collect visible groups" });
  await expect(collect).toBeDisabled();
  await page.getByRole("checkbox", { name: /I authorize/ }).check();
  await collect.click();
  await expect(
    page.getByRole("heading", { name: "2 groups collected" }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "Fixture two" }).uncheck();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export 1 selected groups" }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("staysuite-groups.json");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(JSON.parse(Buffer.concat(chunks).toString())).toEqual({
    format: "staysuite-visible-groups-v1",
    collected_at: "2026-10-22T10:00:00Z",
    groups: [
      {
        url: "https://www.facebook.com/groups/fixtureone/",
        title: "Fixture one",
      },
    ],
  });
  await page.getByRole("button", { name: "Clear collected list" }).click();
  await expect(
    page.getByRole("heading", { name: "2 groups collected" }),
  ).toHaveCount(0);
});

test("popup handles Chrome permission denial without disclosing raw browser errors", async ({
  context,
  page,
}) => {
  await servePopup(context);
  await page.addInitScript(() => {
    Object.defineProperty(window, "chrome", {
      configurable: true,
      value: {
        tabs: { query: async () => [{ id: 1 }] },
        scripting: {
          executeScript: async () => {
            throw new Error(
              "Denied: https://private.example/?code=not-to-display",
            );
          },
        },
      },
    });
  });
  await page.goto("http://extension-fixture.test/popup.html");
  await page.getByRole("checkbox", { name: /I authorize/ }).check();
  await page.getByRole("button", { name: "Collect visible groups" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Collection could not run",
  );
  await expect(page.getByRole("alert")).not.toContainText("private.example");
});

test("popup sends only checked groups and confirms receipt rather than database success", async ({
  context,
  page,
}) => {
  await servePopup(context);
  await page.addInitScript(() => {
    Object.defineProperty(crypto, "randomUUID", {
      configurable: true,
      value: () => "11111111-1111-4111-8111-111111111111",
    });
    Object.defineProperty(window, "chrome", {
      configurable: true,
      value: {
        permissions: { request: async () => true },
        tabs: {
          query: async () => [
            {
              id: 1,
              status: "complete",
              url: "http://localhost:3000/dashboard/my-groups",
            },
          ],
          update: async () => ({}),
        },
        scripting: {
          executeScript: async (input: {
            args?: unknown[];
            func?: { toString(): string };
          }) => {
            if (input.args) {
              Reflect.set(window, "__sent", input.args[0]);
              Reflect.set(window, "__deliverySource", input.func?.toString());
              return [{ result: { result: "received" } }];
            }
            return [
              {
                result: {
                  format: "staysuite-visible-groups-v1",
                  collected_at: "2026-10-23T00:00:00Z",
                  groups: [
                    {
                      url: "https://www.facebook.com/groups/one/",
                      title: "Fixture one",
                    },
                    {
                      url: "https://www.facebook.com/groups/two/",
                      title: "Fixture two",
                    },
                  ],
                },
              },
            ];
          },
        },
      },
    });
  });
  await page.goto("http://extension-fixture.test/popup.html");
  await page.getByRole("checkbox", { name: /I authorize/ }).check();
  await page.getByRole("button", { name: "Collect visible groups" }).click();
  await page.getByRole("checkbox", { name: "Fixture two" }).uncheck();
  await page
    .getByRole("button", { name: "Send 1 selected groups to StaySuite" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Groups received in My Groups",
  );
  await expect(page.getByRole("status")).toContainText("Import");
  const sent = await page.evaluate(() => Reflect.get(window, "__sent"));
  expect(sent.collection.groups).toEqual([
    { url: "https://www.facebook.com/groups/one/", title: "Fixture one" },
  ]);
  // Exercise the production-bundled function in an actual isolated world, not
  // just its TypeScript source. This is a bridge harness, not extension install.
  const source = await page.evaluate(() =>
    Reflect.get(window, "__deliverySource"),
  );
  const receiver = await context.newPage();
  await receiver.goto("http://localhost:3000/dashboard/my-groups");
  await expect(
    receiver.locator("[data-staysuite-group-receiver=ready]"),
  ).toBeVisible();
  const session = await context.newCDPSession(receiver);
  const tree = await session.send("Page.getFrameTree");
  const world = await session.send("Page.createIsolatedWorld", {
    frameId: tree.frameTree.frame.id,
    worldName: "staysuite-bridge-fixture",
  });
  const outcome = await session.send("Runtime.evaluate", {
    expression: `(${source})(${JSON.stringify(sent)})`,
    contextId: world.executionContextId,
    awaitPromise: true,
    returnByValue: true,
  });
  expect(outcome.exceptionDetails).toBeUndefined();
  expect(outcome.result.value).toEqual({ result: "received" });
  await expect(receiver.getByText("Review 1 group")).toBeVisible();
  await session.detach();
});

test("popup keeps a batch across reopening and adds later groups without reselecting duplicates", async ({ context, page }) => {
  await servePopup(context);
  await page.addInitScript(() => {
    Object.defineProperty(window, "chrome", { configurable: true, value: {
      storage: { session: {
        get: async (key: string) => ({ [key]: JSON.parse(sessionStorage.getItem(key) || "null") }),
        set: async (values: Record<string, unknown>) => { for (const [key, value] of Object.entries(values)) sessionStorage.setItem(key, JSON.stringify(value)); },
        remove: async (key: string) => { sessionStorage.removeItem(key); },
      } },
      tabs: { query: async () => [{ id: 1 }] },
      scripting: { executeScript: async () => {
        const pass = Number(sessionStorage.getItem("pass") || 0);
        sessionStorage.setItem("pass", String(pass + 1));
        return [{ result: { format: "staysuite-visible-groups-v1", collected_at: "2026-10-23T00:00:00Z", groups: (pass === 0 ? ["one", "two", "three", "four", "five", "six"] : ["six", "seven", "eight"]).map(id => ({ url: `https://www.facebook.com/groups/${id}/`, title: `Fixture ${id}` })) } }];
      } },
    } });
  });
  await page.goto("http://extension-fixture.test/popup.html");
  await page.getByRole("checkbox", { name: /I authorize/ }).check();
  await page.getByRole("button", { name: "Collect visible groups" }).click();
  await expect(page.getByRole("heading", { name: "6 groups collected" })).toBeVisible();
  await page.getByRole("checkbox", { name: /Fixture two/ }).uncheck();
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("staysuite-group-batch-v1") || "{}").selected?.length)).toBe(5);
  await page.reload();
  await expect(page.getByRole("heading", { name: "6 groups collected" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Fixture two/ })).not.toBeChecked();
  await page.getByRole("checkbox", { name: /I authorize/ }).check();
  await page.getByRole("button", { name: "Add more visible groups" }).click();
  await expect(page.getByRole("heading", { name: "8 groups collected" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("2 new groups added");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
    await page.locator("main").screenshot({ path: test.info().outputPath(`extension-batch-${scheme}.png`) });
  }
  await expect(page.getByRole("checkbox", { name: /Fixture two/ })).not.toBeChecked();
  await page.getByLabel("Find in this batch").fill("seven");
  await expect(page.getByRole("list", { name: "Collected groups" }).getByRole("checkbox")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Send 7 selected groups to StaySuite" })).toBeEnabled();
  await page.getByRole("button", { name: "Add more visible groups" }).click();
  await expect(page.getByRole("status")).toContainText("No new groups");
  await page.getByRole("button", { name: "Clear collected list" }).click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("staysuite-group-batch-v1"))).toBeNull();
  await page.reload();
  await expect(page.getByRole("heading", { name: /groups collected/ })).toHaveCount(0);
});
