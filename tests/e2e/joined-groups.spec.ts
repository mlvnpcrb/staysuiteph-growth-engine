import { test, expect } from "@playwright/test";
import { collectVisibleGroups } from "../../apps/extension/lib/collect-visible-groups";
const collection = {
  format: "staysuite-visible-groups-v1",
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

test("import assesses, deduplicates, selects and saves through the existing API", async ({
  page,
}) => {
  const saved: unknown[] = [];
  await page.route("**/api/groups", (route) => {
    saved.push(route.request().postDataJSON());
    return route.fulfill({ json: { duplicate: false } });
  });
  await page.goto("/dashboard/group-finder");
  await expect(
    page.getByLabel("Import StaySuite group collection"),
  ).toBeEnabled();
  const file = {
    name: "staysuite-groups.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(collection)),
  };
  await page
    .getByLabel("Import StaySuite group collection")
    .setInputFiles(file);
  await expect(page.getByText("2 unique groups imported")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save selected groups" }),
  ).toBeDisabled();
  await page.getByLabel("Destination", { exact: true }).fill("Cebu");
  await expect(page.getByText(/\/100 text relevance/)).toHaveCount(2);
  await page
    .getByLabel("Import StaySuite group collection")
    .setInputFiles(file);
  await expect(page.getByText("2 unique groups imported")).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Bohol resort hosts — fixture" })
    .uncheck();
  await page.getByRole("button", { name: "Save selected groups" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "1 groups saved" }),
  ).toBeVisible();
  expect(saved).toEqual([
    {
      destination: "Cebu",
      accommodation: "Condo",
      audience: "Guests",
      url: collection.groups[0]!.url,
      title: collection.groups[0]!.title,
      evidence: "",
    },
  ]);
  await page.getByRole("button", { name: "Clear imported list" }).click();
  await expect(
    page.getByText(
      "Imported list cleared locally. Saved groups are unchanged.",
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("invalid imports and save failures preserve an honest recoverable preview", async ({
  page,
}) => {
  await page.route("**/api/groups", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Saving is not connected yet." },
    }),
  );
  await page.goto("/dashboard/group-finder");
  await page.getByLabel("Destination", { exact: true }).fill("Cebu");
  const upload = page.getByLabel("Import StaySuite group collection");
  await upload.setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"access_token":"should not be accepted"}'),
  });
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Invalid collection",
  );
  await upload.setInputFiles({
    name: "groups.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(collection)),
  });
  await page.getByRole("button", { name: "Save selected groups" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Saving is not connected",
  );
  await expect(page.getByRole("status")).toContainText(
    "Saving stopped after an error",
  );
  await expect(page.getByText("2 unique groups imported")).toBeVisible();
});
