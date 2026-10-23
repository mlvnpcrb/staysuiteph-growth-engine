import { settleTheme } from "./helpers/settle-theme";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { SavedGroup } from "@staysuite/types";
const base: SavedGroup = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "11111111-1111-4111-8111-111111111111",
  identity: "fixture",
  url: "https://www.facebook.com/groups/fixture/",
  title: "Cebu condo guests — test fixture",
  destination: "Cebu",
  accommodation: "Condo",
  audience: "Guests",
  evidence: "",
  source: "manual",
  notes: "Keep private notes",
  review_status: "reviewed",
  rule_evidence: "Test excerpt: promotional content requires review",
  last_reviewed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
test("marketing evidence persists, explains ranking and can be cleared without changing notes", async ({
  page,
}) => {
  const group = { ...base };
  let changes = 0;
  await page.route("**/api/groups", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: {
          groups: [group],
          stats: { total: 1, reviewed: 1, needsReview: 0 },
        },
      });
    const input = route.request().postDataJSON();
    if (input.operation === "marketing_evidence") {
      changes++;
      Object.assign(group, {
        marketing_evidence: input.marketing_evidence,
        updated_at: new Date().toISOString(),
      });
      return route.fulfill({ json: { group } });
    }
    return route.fulfill({
      status: 400,
      json: { error: "Unexpected operation" },
    });
  });
  await page.goto("/dashboard/my-groups");
  let analysis = page.getByRole("region", {
    name: `Marketing analysis for ${group.title}`,
  });
  await expect(analysis.getByText("30/100 marketing score")).toBeVisible();
  await analysis.getByText("Score breakdown & evidence").click();
  await expect(
    analysis.getByText("Recent activity: Unknown", { exact: true }),
  ).toBeVisible();
  await analysis
    .getByText("Record marketing evidence", { exact: true })
    .click();
  const date = await page.evaluate(() =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  );
  await analysis.getByLabel("Observation date (Asia/Manila)").fill(date);
  for (const [label, value] of [
    ["Posts in the last 7 days", "14"],
    ["Posts sampled for comments", "10"],
    ["Total comments on sampled posts", "50"],
    ["Your enquiries in the last 30 days", "5"],
    ["Your bookings in the last 30 days", "2"],
  ])
    await analysis.getByLabel(label!).fill(value!);
  await analysis
    .getByRole("combobox", {
      name: "Promotional content allowed (personally checked)",
    })
    .selectOption("yes");
  await analysis
    .getByRole("button", { name: "Save marketing evidence", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Marketing evidence saved" }),
  ).toBeVisible();
  analysis = page.getByRole("region", {
    name: `Marketing analysis for ${group.title}`,
  });
  await expect(analysis.getByText("100/100 marketing score")).toBeVisible();
  await expect(
    analysis.getByText("Permission reviewed — recheck for each campaign", {
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("marketing-ranking.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(analysis.getByText("100/100 marketing score")).toBeVisible();
  await analysis
    .getByText("Record marketing evidence", { exact: true })
    .click();
  await analysis
    .getByRole("button", { name: "Clear marketing evidence", exact: true })
    .click();
  await expect(analysis.getByText("30/100 marketing score")).toBeVisible();
  expect(group.notes).toBe(base.notes);
  expect(group.rule_evidence).toBe(base.rule_evidence);
  expect(changes).toBe(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("permission filters and marketing sorting remain separate from score and accessible", async ({
  page,
}) => {
  const full = {
    observed_at: new Date(Date.now() - 86400000).toISOString(),
    source_url: base.url,
    posts_7d: 14,
    sample_posts: 10,
    sample_comments: 50,
    enquiries_30d: 5,
    bookings_30d: 2,
    promotion_allowed: false,
  };
  const blocked = {
    ...base,
    title: "Blocked high-score fixture",
    marketing_evidence: full,
  };
  const unknown = {
    ...base,
    id: "22222222-2222-4222-8222-222222222222",
    identity: "unknown",
    url: "https://www.facebook.com/groups/unknown/",
    title: "Unknown evidence fixture",
    destination: "",
    accommodation: "",
    audience: "",
    review_status: "review_required" as const,
  };
  await page.route("**/api/groups", (route) =>
    route.fulfill({
      json: {
        groups: [blocked, unknown],
        stats: { total: 2, reviewed: 1, needsReview: 1 },
      },
    }),
  );
  await page.goto("/dashboard/my-groups");
  await expect(
    page
      .locator("article.saved-group")
      .first()
      .getByRole("heading", { level: 2 }),
  ).toHaveText("Unknown evidence fixture");
  await page
    .getByRole("combobox", { name: "Permission review", exact: true })
    .selectOption("blocked");
  await expect(page.locator("article.saved-group")).toHaveCount(1);
  await expect(
    page.getByText("Blocked for campaign planning", { exact: true }),
  ).toBeVisible();
  const analysis = page.getByRole("region", {
    name: "Marketing analysis for Blocked high-score fixture",
  });
  await analysis
    .getByText("Record marketing evidence", { exact: true })
    .click();
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "Toggle color theme" }).click();
    await settleTheme(page, theme);
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
        .violations,
    ).toEqual([]);
  }
});
