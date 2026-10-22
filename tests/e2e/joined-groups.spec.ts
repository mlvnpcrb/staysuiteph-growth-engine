import { test, expect } from "@playwright/test";
import { deliverGroupCollection } from "../../apps/extension/lib/send-to-dashboard";
import { collectVisibleGroups } from "../../apps/extension/lib/collect-visible-groups";
const collection = {
  format: "staysuite-visible-groups-v1" as const,
  collected_at: "2026-10-22T10:00:00Z",
  groups: [
    {
      url: "https://www.facebook.com/groups/cebutest/",
      title: "Cebu condo guests — fixture",
    },
    {
      url: "https://www.facebook.com/groups/boholtest/",
      title: "Bohol resort hosts — fixture",
    },
  ],
};

test("collector reads only visible root group link labels on joined-groups fixture", async ({
  page,
}) => {
  await page.route("https://www.facebook.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<meta charset="utf-8"><main>
 <a href="/groups/cebuTest/?ref=secret">Cebu condo guests — fixture</a>
 <a href="/groups/cebutest/">Duplicate</a>
 <a href="/groups/joins/">Directory</a>
 <a href="https://facebook.com.evil.test/groups/evil/">Forged</a>
 <a href="/groups/test/posts/123/">Post must not be collected</a>
 <a style="display:none" href="/groups/hidden/">Hidden group</a>
 <span style="opacity:0"><a href="/groups/transparent/">Invisible parent</a></span>
 <a aria-hidden="true" href="/groups/ariahidden/">Aria hidden</a>
 <a style="position:absolute;top:5000px" href="/groups/offscreen/">Offscreen group</a>
 <p>Private member post and description must never be exported.</p>
 </main><nav><a href="/groups/navigation/">Outside main</a></nav>`,
    }),
  );
  await page.goto("https://www.facebook.com/groups/joins/");
  const result = await page.evaluate(collectVisibleGroups);
  expect(result).toMatchObject({
    format: "staysuite-visible-groups-v1",
    groups: [
      {
        url: "https://www.facebook.com/groups/cebutest/",
        title: "Cebu condo guests — fixture",
      },
    ],
  });
  expect(JSON.stringify(result)).not.toMatch(
    /secret|Private member|cookie|description/,
  );
});

test("collector fails closed on other pages, dialogs, challenges and changed layouts", async ({
  page,
}) => {
  await page.route("https://www.facebook.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<main><a href="/groups/test/">Fixture group</a></main>',
    }),
  );
  await page.goto("https://www.facebook.com/groups/test/");
  expect(await page.evaluate(collectVisibleGroups)).toHaveProperty("error");
  await page.goto("https://www.facebook.com/groups/joins/");
  await page.evaluate(() => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.append(dialog);
  });
  expect(await page.evaluate(collectVisibleGroups)).toHaveProperty("error");
  await page.evaluate(() => {
    document.querySelector("[role=dialog]")?.remove();
    document.title = "Security check";
  });
  expect(await page.evaluate(collectVisibleGroups)).toHaveProperty("error");
  await page.evaluate(() => {
    document.title = "Fixture";
    document.querySelector("main")?.remove();
  });
  expect(await page.evaluate(collectVisibleGroups)).toHaveProperty("error");
});

import type { Page } from "@playwright/test";
import type { SavedGroup } from "@staysuite/types";
import AxeBuilder from "@axe-core/playwright";
async function mockGroups(
  page: Page,
  options: {
    existing?: boolean;
    failSecond?: boolean;
    failCheck?: boolean;
  } = {},
) {
  const rows: SavedGroup[] = options.existing
    ? [
        {
          ...collection.groups[0]!,
          id: "11111111-1111-4111-8111-111111111111",
          user_id: "11111111-1111-4111-8111-111111111111",
          identity: "cebutest",
          destination: "Cebu",
          accommodation: "Condo",
          audience: "Guests",
          evidence: "",
          source: "manual",
          notes: "Original private note",
          review_status: "reviewed",
          rule_evidence: "Original rule evidence",
          last_reviewed_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]
    : [];
  const writes: Record<string, unknown>[] = [];
  let checks = 0;
  await page.route("**/api/groups", (route) => {
    const request = route.request();
    if (request.method() === "GET")
      return route.fulfill({
        json: {
          groups: rows,
          stats: { total: rows.length, reviewed: 0, needsReview: rows.length },
        },
      });
    const body = request.postDataJSON();
    if (body.operation === "check_duplicates") {
      checks++;
      if (options.failCheck && checks === 1)
        return route.fulfill({
          status: 503,
          json: { error: "Check unavailable" },
        });
      return route.fulfill({
        json: { identities: rows.map((g) => g.identity) },
      });
    }
    if (request.method() === "PATCH") {
      const group = rows.find((g) => g.id === body.id);
      Object.assign(group!, body, { updated_at: new Date().toISOString() });
      return route.fulfill({ json: { group } });
    }
    writes.push(body);
    if (options.failSecond && writes.length === 2)
      return route.fulfill({
        status: 503,
        json: { error: "Temporary failure" },
      });
    const identity = new URL(body.url).pathname.split("/")[2]!;
    const prior = rows.find((g) => g.identity === identity);
    if (prior)
      return route.fulfill({ json: { group: prior, duplicate: true } });
    const group: SavedGroup = {
      ...body,
      identity,
      destination: "",
      accommodation: "",
      audience: "",
      evidence: "",
      id: `22222222-2222-4222-8222-${String(rows.length + 1).padStart(12, "0")}`,
      user_id: "11111111-1111-4111-8111-111111111111",
      source: "manual",
      notes: "",
      review_status: "review_required",
      rule_evidence: "",
      last_reviewed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    rows.push(group);
    return route.fulfill({ json: { group, duplicate: false } });
  });
  return { rows, writes };
}
async function transfer(page: Page) {
  await expect(
    page.locator("[data-staysuite-group-receiver=ready]"),
  ).toBeVisible();
  expect(
    await page.evaluate(deliverGroupCollection, {
      origin: new URL(page.url()).origin,
      transferId: "11111111-1111-4111-8111-111111111111",
      collection,
    }),
  ).toEqual({ result: "received" });
}

test("My Groups previews duplicates, imports without hosting context, and preserves notes", async ({
  page,
}) => {
  const data = await mockGroups(page, { existing: true });
  await page.goto("/dashboard/my-groups");
  await transfer(page);
  const importer = page.getByRole("region", { name: "Import from Facebook" });
  await expect(
    importer.getByText("Already saved", { exact: true }),
  ).toHaveCount(1);
  await importer
    .getByRole("button", { name: "Import 1 group", exact: true })
    .click();
  await expect(importer.getByRole("status")).toContainText(
    "1 imported · 1 already saved · 0 failed",
  );
  await page.screenshot({
    path: test.info().outputPath("my-groups-import-ux.png"),
    fullPage: true,
  });
  expect(data.writes).toEqual([collection.groups[1]]);
  expect(data.rows[0]?.notes).toBe("Original private note");
  expect(data.rows[0]?.rule_evidence).toBe("Original rule evidence");
  const entry = page.locator("article.saved-group").filter({
    has: page.getByRole("heading", {
      name: collection.groups[1]!.title,
      exact: true,
    }),
  });
  await entry.getByText("Notes & rule review").click();
  await entry.getByLabel("Destination", { exact: true }).fill("Bohol");
  await entry
    .getByRole("combobox", { name: "Accommodation", exact: true })
    .selectOption("Resort");
  await entry
    .getByRole("combobox", { name: "Audience", exact: true })
    .selectOption("Hosts");
  await entry.getByRole("button", { name: "Save changes" }).click();
  await expect(entry.getByText("Bohol · Resort · Hosts")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("retry failed imports sends only failed rows and retains completed results", async ({
  page,
}) => {
  const data = await mockGroups(page, { failSecond: true });
  await page.goto("/dashboard/my-groups");
  await transfer(page);
  const importer = page.getByRole("region", { name: "Import from Facebook" });
  await importer
    .getByRole("button", { name: "Import 2 groups", exact: true })
    .click();
  await expect(importer.getByRole("status")).toContainText(
    "1 imported · 0 already saved · 1 failed",
  );
  await importer
    .getByRole("button", { name: "Retry failed (1)", exact: true })
    .click();
  await expect(importer.getByRole("status")).toContainText(
    "2 imported · 0 already saved · 0 failed",
  );
  expect(data.writes.map((g) => g.url)).toEqual([
    collection.groups[0]!.url,
    collection.groups[1]!.url,
    collection.groups[1]!.url,
  ]);
});

test("duplicate-check recovery blocks unchecked imports and invalid files stay rejected", async ({
  page,
}) => {
  const data = await mockGroups(page, { failCheck: true });
  await page.goto("/dashboard/my-groups");
  await transfer(page);
  const importer = page.getByRole("region", { name: "Import from Facebook" });
  await expect(importer.getByRole("alert")).toContainText("Couldn’t check");
  await expect(
    importer.getByRole("button", { name: "Import 0 groups", exact: true }),
  ).toBeDisabled();
  await importer.getByRole("button", { name: "Retry duplicate check" }).click();
  await expect(
    importer.getByRole("button", { name: "Import 2 groups", exact: true }),
  ).toBeEnabled();
  expect(data.writes).toHaveLength(0);
  await importer.getByText("Setup & connection help").click();
  await importer.getByLabel("Import StaySuite group collection").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"access_token":"no"}'),
  });
  await expect(importer.getByRole("alert")).toContainText("Invalid collection");
});

test("connection states are honest and foreign or malformed transfers cannot write data", async ({
  page,
}) => {
  const data = await mockGroups(page);
  await page.goto("/dashboard/my-groups");
  const importer = page.getByRole("region", { name: "Import from Facebook" });
  await expect(
    importer.getByText("Extension needed", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.postMessage({ type: "STAYSUITE_EXTENSION_HELLO" }, location.origin),
  );
  await expect(
    importer.getByText("Ready to collect", { exact: true }),
  ).toBeVisible();
  await page.evaluate(
    (collection) =>
      window.dispatchEvent(
        new MessageEvent("message", {
          source: window,
          origin: "https://evil.test",
          data: {
            type: "STAYSUITE_GROUP_IMPORT",
            transfer_id: "11111111-1111-4111-8111-111111111111",
            collection,
          },
        }),
      ),
    collection,
  );
  await expect(
    importer.getByRole("heading", { name: "Review 2 groups" }),
  ).toHaveCount(0);
  await page.evaluate(
    (collection) =>
      window.postMessage(
        {
          type: "STAYSUITE_GROUP_IMPORT",
          transfer_id: "11111111-1111-4111-8111-111111111111",
          collection: { ...collection, user_id: "forged" },
        },
        location.origin,
      ),
    collection,
  );
  await expect(importer.getByRole("alert")).toContainText("rejected");
  expect(data.writes).toHaveLength(0);
  await transfer(page);
  await expect(
    importer.getByText("Groups received", { exact: true }),
  ).toBeVisible();
  await importer.getByRole("button", { name: "Clear preview" }).click();
  await expect(
    importer.getByText("Ready to collect", { exact: true }),
  ).toBeVisible();
});

test("import preview supports filtering, optional reselection and both accessible themes", async ({
  page,
}) => {
  await mockGroups(page);
  await page.goto("/dashboard/my-groups");
  await transfer(page);
  const importer = page.getByRole("region", { name: "Import from Facebook" });
  await expect(importer.getByRole("checkbox")).toHaveCount(0);
  await importer.getByRole("button", { name: "Change selection" }).click();
  await importer
    .getByRole("checkbox", { name: collection.groups[1]!.title })
    .uncheck();
  await expect(
    importer.getByRole("button", { name: "Import 1 group", exact: true }),
  ).toBeEnabled();
  await importer.getByLabel("Filter imported groups").fill("Cebu");
  await expect(importer.locator("article")).toHaveCount(1);
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "Toggle color theme" }).click();
    // Audit the settled theme, rather than an intermediate transition color.
    await page.evaluate(async () => {
      await Promise.all(
        document.getAnimations().map((animation) => animation.finished.catch(() => {})),
      );
    });
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
        .violations,
    ).toEqual([]);
  }
});
