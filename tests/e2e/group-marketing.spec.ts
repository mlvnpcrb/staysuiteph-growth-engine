import { test, expect } from "@playwright/test";
import type { SavedGroup } from "@staysuite/types";
import AxeBuilder from "@axe-core/playwright";
const group: SavedGroup = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "11111111-1111-4111-8111-111111111111",
  identity: "fixture",
  url: "https://www.facebook.com/groups/fixture/",
  title: "Cebu group fixture",
  destination: "Cebu",
  accommodation: "Condo",
  audience: "Guests",
  evidence: "",
  source: "manual",
  notes: "Preserve existing private notes",
  review_status: "review_required",
  rule_evidence: "",
  last_reviewed_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
test("group requirements preserve legacy data without exposing custom marketing metrics", async ({
  page,
}) => {
  const current = { ...group };
  const writes: unknown[] = [];
  await page.route("**/api/groups", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: {
          groups: [current],
          stats: { total: 1, reviewed: 0, needsReview: 1 },
        },
      });
    const input = route.request().postDataJSON();
    writes.push(input);
    if (input.operation === "marketing_evidence")
      Object.assign(current, { marketing_evidence: input.marketing_evidence });
    else Object.assign(current, input);
    return route.fulfill({ json: { group: current } });
  });
  await page.goto("/dashboard/my-groups");
  await page.getByRole("button", { name: /^Posting requirements:/ }).click();
  await expect(page.getByLabel("Accommodation", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByText("Marketing potential", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Group rules", { exact: true })
    .fill("Promotion requires admin approval.");
  await page
    .getByRole("combobox", { name: "Review status", exact: true })
    .selectOption("reviewed");
  await page
    .getByRole("combobox", { name: "Promotional posts allowed", exact: true })
    .selectOption("true");
  await page
    .getByLabel("I personally checked these requirements today")
    .check();
  await page
    .getByRole("button", { name: "Save requirements", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Posting requirements saved." }),
  ).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(current.notes).toBe(group.notes);
  expect(current.destination).toBe("Cebu");
  expect(current.marketing_evidence?.promotion_allowed).toBe(true);
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "Toggle color theme" }).click();
    await expect(page.locator("html")).toHaveClass(new RegExp(theme));
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
        .violations,
    ).toEqual([]);
  }
});
