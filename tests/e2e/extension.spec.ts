import AxeBuilder from "@axe-core/playwright";
import { test, expect, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
async function serve(context: BrowserContext) {
  const directory = resolve("apps/extension/build/chrome-mv3-prod");
  await context.route("http://extension-fixture.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("..")) return route.abort();
    await route.fulfill({
      body: await readFile(`${directory}${path}`),
      contentType:
        (
          {
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
            ".png": "image/png",
          } as Record<string, string>
        )[extname(path)] ?? "application/octet-stream",
      headers: {
        "Content-Security-Policy":
          "script-src 'self'; object-src 'none'; base-uri 'none'",
      },
    });
  });
}
async function bridge(context: BrowserContext, denied = false) {
  await context.addInitScript(
    ({ denied }) => {
      const listeners: ((changes: Record<string, unknown>) => void)[] = [];
      const cached = localStorage.getItem("fixture-library");
      let library = cached ? JSON.parse(cached) : null;
      const make = (count: number, phase: string) => ({
        schema: 1,
        actorId: "123456789",
        actorName: "Fixture host",
        groups: Array.from({ length: count }, (_, i) => ({
          title: `Hosts ${i + 1}`,
          url: `https://www.facebook.com/groups/${i + 1}/`,
        })),
        phase,
        pages: phase === "ready" ? 2 : 1,
        complete: phase === "ready",
        updatedAt: new Date().toISOString(),
        syncedAt: phase === "ready" ? new Date().toISOString() : null,
        error: null,
        runId:
          phase === "ready" ? null : "11111111-1111-4111-8111-111111111111",
      });
      Object.assign(window, {
        chrome: {
          runtime: {
            getURL: (path: string) => `http://extension-fixture.test/${path}`,
            getManifest: () => ({ version: "0.2.0" }),
            sendMessage: async ({ type }: { type: string }) => {
              if (type === "FACEBOOK_START") {
                localStorage.setItem(
                  "fixture-starts",
                  String(
                    Number(localStorage.getItem("fixture-starts") ?? 0) + 1,
                  ),
                );
                library = make(6, "fetching");
                setTimeout(() => {
                  library = make(12, "ready");
                  localStorage.setItem(
                    "fixture-library",
                    JSON.stringify(library),
                  );
                  listeners.forEach((listener) =>
                    listener({
                      "staysuite-facebook-library-v1:123456789": {
                        newValue: library,
                      },
                    }),
                  );
                }, 100);
              }
              if (type === "FACEBOOK_FORGET") {
                library = null;
                localStorage.removeItem("fixture-library");
                return { ok: true, actorId: "123456789", library: null };
              }
              return library
                ? { ok: true, actorId: "123456789", library }
                : { ok: false, error: "permission_required" };
            },
          },
          windows: {
            create: async ({ url }: { url: string }) => {
              window.open(url);
            },
          },
          permissions: { request: async () => !denied },
          storage: {
            onChanged: {
              addListener: (
                listener: (changes: Record<string, unknown>) => void,
              ) => listeners.push(listener),
              removeListener: () => {},
            },
          },
        },
      });
    },
    { denied },
  );
}
test("popup launches a workspace with Facebook connection independent of StaySuite", async ({
  context,
  page,
}) => {
  await serve(context);
  await bridge(context);
  await page.goto("http://extension-fixture.test/popup.html");
  await expect(
    page.getByRole("heading", { name: "Your Facebook groups." }),
  ).toBeVisible();
  const opened = context.waitForEvent("page");
  await page.getByRole("button", { name: "Open full workspace" }).click();
  await expect(
    (await opened).getByRole("heading", { name: "Your Facebook groups." }),
  ).toBeVisible();
});
test("denied Facebook permission does not start collection; workspace is accessible in both themes", async ({
  context,
  page,
}) => {
  await serve(context);
  await bridge(context, true);
  await page.goto("http://extension-fixture.test/tabs/groups.html");
  await page.getByRole("button", { name: "Sync Groups" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "No account data was read",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("fixture-starts")),
  ).toBeNull();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
});
test("Connect Facebook automatically fills the library and reopening restores it without a second import", async ({
  context,
  page,
}) => {
  await serve(context);
  await bridge(context);
  await page.goto("http://extension-fixture.test/tabs/groups.html");
  await page.getByRole("button", { name: "Sync Groups" }).click();
  await expect(page.locator(".workspace-list li")).toHaveCount(12);
  await expect(
    page.getByText("Group-list pagination completed.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save all groups to My Groups" }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.locator(".workspace-list li")).toHaveCount(12);
  expect(
    await page.evaluate(() => localStorage.getItem("fixture-starts")),
  ).toBe("1");
  await page.getByRole("searchbox").fill("Hosts 12");
  await expect(page.locator(".workspace-list li")).toHaveCount(1);
});

test("smart category filters overlap, combine with search, and restore without syncing again", async ({
  context,
  page,
}) => {
  await serve(context);
  await bridge(context);
  await page.goto("http://extension-fixture.test/tabs/groups.html");
  await page.evaluate(() => {
    const names = [
      "Cebu Airbnb Staycation Hosts",
      "Tagaytay Staycation Villas",
      "Manila Condo Rentals",
      "Biyahero Travel PH",
      "Neighborhood Book Club",
    ];
    localStorage.setItem(
      "fixture-library",
      JSON.stringify({
        schema: 1,
        actorId: "123456789",
        actorName: "Fixture host",
        groups: names.map((title, index) => ({
          title,
          url: `https://www.facebook.com/groups/${index + 1}/`,
        })),
        phase: "ready",
        pages: 1,
        complete: true,
        updatedAt: new Date().toISOString(),
        syncedAt: new Date().toISOString(),
        error: null,
        runId: null,
      }),
    );
  });
  await page.reload();
  await expect(page.locator(".workspace-list li")).toHaveCount(5);
  const filters = page.getByRole("group", {
    name: "Filter groups by category",
  });
  await filters.getByRole("button", { name: /^Staycation 2$/ }).click();
  await expect(page.locator(".workspace-list li")).toHaveCount(2);
  await page.getByRole("searchbox").fill("cebu");
  await expect(page.locator(".workspace-list li")).toHaveCount(1);
  await filters.getByRole("button", { name: /^Airbnb 1$/ }).click();
  await expect(page.locator(".workspace-list li")).toHaveCount(1);
  await page.getByRole("searchbox").fill("");
  const other = filters.getByRole("button", { name: /^Other 1$/ });
  await other.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".workspace-list li")).toHaveCount(1);
  await expect(page.locator(".workspace-list")).toContainText(
    "Neighborhood Book Club",
  );
  await page.reload();
  await expect(page.locator(".workspace-list li")).toHaveCount(5);
  expect(
    await page.evaluate(() => localStorage.getItem("fixture-starts")),
  ).toBeNull();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
});

test("campaign workspace connects the scoped dashboard but never starts an unvalidated publisher", async ({
  context,
  page,
}) => {
  await serve(context);
  await context.addInitScript(() => {
    const owner = "11111111-1111-4111-8111-111111111111",
      id = "22222222-2222-4222-8222-222222222222",
      group = "33333333-3333-4333-8333-333333333333";
    const job = {
      id,
      user_id: owner,
      title: "Weekend campaign",
      description: "Private notes",
      actor_id: "12345",
      actor_type: "personal",
      plan: {
        version: 1,
        text: "Fixture accommodation offer",
        intervalMinutes: 15,
        groupIds: [group],
        media: [],
      },
      settings: {
        method: "classic",
        pauseEvery: 1,
        pauseMinutes: 2,
        avoidNight: true,
        delayAfterFailure: true,
      },
      state: "draft",
      revision: 1,
      approved_digest: null,
      digest: "a".repeat(64),
      next_eligible_at: new Date().toISOString(),
      stop_reason: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      media: [],
      targets: [
        {
          id: group,
          campaign_id: id,
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
    Object.assign(window, {
      chrome: {
        runtime: {
          getURL: (path: string) => `http://extension-fixture.test/${path}`,
        },
        permissions: { request: async () => true },
        tabs: {
          query: async ({ url }: { url?: string }) =>
            url?.includes("facebook")
              ? [
                  {
                    id: 2,
                    url: "https://www.facebook.com/",
                    status: "complete",
                  },
                ]
              : [
                  {
                    id: 1,
                    url: "http://localhost:3000/dashboard/campaigns",
                    status: "complete",
                  },
                ],
        },
        scripting: {
          executeScript: async ({ args }: { args?: unknown[] }) => {
            if (!args)
              return [
                { result: { actor_id: "12345", actor_type: "personal" } },
              ];
            const path = args[2],
              command = args[3] as { command: string } | null;
            if (
              typeof path === "string" &&
              path.startsWith("/api/campaigns/publisher")
            )
              return [
                {
                  result: {
                    data: {
                      viewer_id: owner,
                      classic: false,
                      direct: false,
                      validation_available: true,
                    },
                  },
                },
              ];
            if (path === "/api/groups")
              return [{ result: { data: { viewer_id: owner, groups: [] } } }];
            if (command) {
              localStorage.setItem("fixture-campaign-command", command.command);
              if (command.command === "approve")
                Object.assign(job, {
                  state: "ready",
                  approved_digest: job.digest,
                  revision: 2,
                });
              return [{ result: { data: { viewer_id: owner, job } } }];
            }
            return [
              { result: { data: { viewer_id: owner, campaigns: [job] } } },
            ];
          },
        },
      },
    });
  });
  await page.goto("http://extension-fixture.test/tabs/campaigns.html");
  await expect(page.getByLabel("StaySuite Preview URL")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Connect StaySuite and Facebook" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Automatic submission is disabled",
  );
  await page
    .getByRole("button", { name: "Review campaign", exact: true })
    .click();
  await expect(
    page.getByText("Fixture accommodation offer", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: /I reviewed this exact text/ })
    .check();
  await page
    .getByRole("button", { name: "Approve saved campaign", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: /I reviewed this exact text/ })
    .check();
  await expect(
    page.getByRole("button", { name: "Start sequential posting" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() => localStorage.getItem("fixture-campaign-command")),
  ).toBe("approve");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

