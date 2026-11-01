import { test, expect } from "@playwright/test";
import type { SavedGroup } from "@staysuite/types";
test("All groups uses name search and the reference sort choices, without hospitality categories", async ({
  page,
}) => {
  const groups: SavedGroup[] = ["Zebra community", "Alpha community"].map(
    (title, index) => ({
      id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
      user_id: "11111111-1111-4111-8111-111111111111",
      identity: `fixture${index}`,
      url: `https://www.facebook.com/groups/fixture${index}/`,
      title,
      destination: "",
      accommodation: "",
      audience: "",
      evidence: "",
      source: "manual",
      notes: "",
      review_status: "review_required",
      rule_evidence: "",
      last_reviewed_at: null,
      created_at: new Date(Date.UTC(2026, 9, 22, index)).toISOString(),
      updated_at: new Date().toISOString(),
    }),
  );
  let writes = 0;
  await page.route("**/api/groups", (route) => {
    if (route.request().method() !== "GET") writes++;
    return route.fulfill({
      json: { groups, stats: { total: 2, reviewed: 0, needsReview: 2 } },
    });
  });
  await page.goto("/dashboard/my-groups");
  await expect(
    page.getByRole("heading", { name: "All groups", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Filter groups by category" }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Sort groups", exact: true })
    .selectOption("oldest");
  await expect(page.locator(".saved-group h2").first()).toHaveText(
    "Zebra community",
  );
  await page
    .getByRole("combobox", { name: "Sort groups", exact: true })
    .selectOption("name");
  await expect(page.locator(".saved-group h2").first()).toHaveText(
    "Alpha community",
  );
  await page.getByLabel("Search groups", { exact: true }).fill("Zebra");
  await expect(page.locator(".saved-group")).toHaveCount(1);
  expect(writes).toBe(0);
});
