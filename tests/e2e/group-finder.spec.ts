import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { SavedGroup } from "../../packages/types/src";
// Browser-only backend fixtures. No hosted account, Facebook fetch or live persistence.
test("manual discovery → assessment → save → notes/review → overview → removal", async ({
  page,
}) => {
  const groups: SavedGroup[] = [];
  const owner = "11111111-1111-4111-8111-111111111111";
  await page.route("**/api/groups", async (route) => {
    const request = route.request();
    const input = request.method() === "GET" ? null : request.postDataJSON();
    let result: unknown;
    if (request.method() === "GET")
      result = {
        groups,
        stats: {
          total: groups.length,
          reviewed: groups.filter((g) => g.review_status === "reviewed").length,
          needsReview: groups.filter(
            (g) => g.review_status === "review_required",
          ).length,
        },
      };
    else if (request.method() === "POST") {
      if (groups.length) result = { group: groups[0], duplicate: true };
      else {
        groups.push({
          ...input,
          id: owner,
          user_id: owner,
          identity: "123456789012345",
          source: "manual",
          notes: "",
          review_status: "review_required",
          rule_evidence: "",
          last_reviewed_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        result = { group: groups[0], duplicate: false };
      }
    } else if (request.method() === "PATCH") {
      Object.assign(groups[0]!, input, {
        last_reviewed_at: input.confirm_review
          ? new Date().toISOString()
          : groups[0]?.last_reviewed_at,
        updated_at: new Date().toISOString(),
      });
      result = { group: groups[0] };
    } else {
      groups.splice(0);
      result = { removed: true };
    }
    await route.fulfill({ json: result });
  });
  await page.goto("/dashboard/group-finder");
  await page.getByLabel("Destination", { exact: true }).fill("Cebu City");
  await page.getByRole("button", { name: "Find search ideas" }).click();
  await expect(
    page.getByText(/Automatic search is not connected/),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Search Facebook Groups" }),
  ).toHaveAttribute("href", /facebook.com\/search\/groups/);
  await page
    .getByLabel("Facebook Group URL")
    .fill("https://m.facebook.com/groups/123456789012345/?ref=share");
  await page
    .getByLabel("Group name")
    .fill("Cebu City Condo Rentals — test fixture");
  await page
    .getByLabel("Description or evidence")
    .fill(
      "User-supplied test fixture for accommodation guests, not a discovered group.",
    );
  await page.getByRole("button", { name: "Assess this group" }).click();
  await expect(
    page.getByText("Rule-based assessment · AI not connected"),
  ).toBeVisible();
  await expect(page.getByText(/posting permissions are unknown/)).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("finder.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save to My Groups" }).click();
  await expect(page.getByRole("status")).toContainText("Group saved");
  await page.getByRole("button", { name: "Save to My Groups" }).click();
  await expect(page.getByRole("status")).toContainText(
    "already in your shortlist",
  );
  await page.getByRole("link", { name: "Open My Groups" }).click();
  await page.getByText("Notes & rule review").click();
  await page.getByLabel("Private notes").fill("Personally useful");
  await page
    .getByLabel("Rules you personally reviewed")
    .fill("Test excerpt: admin approval required.");
  await page
    .getByLabel("Review status", { exact: true })
    .selectOption("reviewed");
  await page.getByLabel("I personally reviewed these rules today").check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Notes and review saved" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("article.saved-group .subtle-badge")).toBeVisible();
  await page.getByText("Notes & rule review").click();
  await expect(page.getByLabel("Private notes")).toHaveValue(
    "Personally useful",
  );
  await page.getByRole("button", { name: "Clear notes" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Notes and review saved" }),
  ).toBeVisible();
  await page.goto("/dashboard/overview");
  await expect(
    page
      .getByRole("region", { name: "Saved group activity" })
      .getByText("1", { exact: true })
      .first(),
  ).toBeVisible();
  await page.goto("/dashboard/my-groups");
  await page.getByRole("button", { name: "Remove group" }).click();
  await page.getByRole("button", { name: "Confirm removal" }).click();
  await expect(
    page.getByText("Your shortlist starts with one good group."),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("provider-independent search and persistence failure stay honest and usable", async ({
  page,
}) => {
  await page.route("**/api/groups", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Saving is not connected yet." },
    }),
  );
  await page.goto("/dashboard/group-finder");
  await page.getByLabel("Destination", { exact: true }).fill("Baguio");
  await page.getByRole("button", { name: "Find search ideas" }).click();
  await expect(
    page.getByRole("link", { name: "Search the web" }),
  ).toHaveAttribute("href", /google.com/);
  await page.reload();
  await expect(page.getByLabel("Destination", { exact: true })).toHaveValue(
    "Baguio",
  );
  await page.goto("/dashboard/my-groups");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "unavailable",
  );
  await page.getByRole("button", { name: "Retry loading" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
});

test("finder forms are accessible in both themes", async ({ page }) => {
  await page.goto("/dashboard/group-finder");
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "Toggle color theme" }).click();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(result.violations).toEqual([]);
  }
});
