import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { settleTheme } from "./helpers/settle-theme";
const viewer = "11111111-1111-4111-8111-111111111111",
  catId = "22222222-2222-4222-8222-222222222222",
  collectionId = "33333333-3333-4333-8333-333333333333";
test("category manager and group collection CRUD persist through reload", async ({
  page,
}, testInfo) => {
  const stamp = new Date().toISOString();
  let categories: {
    id: string;
    user_id: string;
    name: string;
    revision: number;
    created_at: string;
    updated_at: string;
  }[] = [];
  let collections: {
    id: string;
    user_id: string;
    name: string;
    revision: number;
    group_ids: string[];
    created_at: string;
    updated_at: string;
  }[] = [];
  await page.route("**/api/templates**", (route) =>
    route.fulfill({ json: { viewer_id: viewer, templates: [] } }),
  );
  await page.route("**/api/groups", (route) =>
    route.fulfill({
      json: {
        viewer_id: viewer,
        groups: [],
        stats: { total: 0, reviewed: 0, needsReview: 0 },
      },
    }),
  );
  await page.route("**/api/library", async (route) => {
    if (route.request().method() === "POST") {
      const input = route.request().postDataJSON();
      if (input.operation === "category_create")
        categories.push({
          id: catId,
          user_id: viewer,
          name: input.name,
          revision: 1,
          created_at: stamp,
          updated_at: stamp,
        });
      if (input.operation === "category_delete") categories = [];
      if (input.operation === "collection_create")
        collections.push({
          id: collectionId,
          user_id: viewer,
          name: input.name,
          revision: 1,
          group_ids: input.group_ids,
          created_at: stamp,
          updated_at: stamp,
        });
      if (input.operation === "collection_save")
        collections = collections.map((item) => ({
          ...item,
          name: input.name,
          revision: item.revision + 1,
        }));
      if (input.operation === "collection_delete") collections = [];
      return route.fulfill({
        json: {
          snapshot: {
            viewer_id: viewer,
            categories,
            collections,
            assignments: [],
          },
          template: null,
        },
      });
    }
    return route.fulfill({
      json: { viewer_id: viewer, categories, collections, assignments: [] },
    });
  });
  await page.goto("/dashboard/templates");
  await page.getByRole("button", { name: "Categories", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Manage Categories" });
  await dialog.getByLabel("Category Name", { exact: true }).fill("Holiday");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog.getByText("Holiday", { exact: true })).toBeVisible();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => {
      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(value);
    }, theme);
    await settleTheme(page, theme);
    await page.screenshot({
      path: testInfo.outputPath(`categories-${theme}.png`),
      fullPage: true,
    });
    expect(
      (
        await new AxeBuilder({ page })
          .include(".reference-library-dialog")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.classList.add("light");
  });
  await settleTheme(page, "light");
  await dialog.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Groups", exact: true }).click();
  await page
    .getByRole("button", { name: "Add a new group collection", exact: true })
    .click();
  await page
    .getByLabel("Name of the group collection", { exact: true })
    .fill("Beach hosts");
  await page.getByRole("button", { name: "Save Group Collection" }).click();
  await expect(
    page.getByRole("button", { name: "Beach hosts 0 groups" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Groups", exact: true }).click();
  await page.getByRole("button", { name: "Beach hosts 0 groups" }).click();
  await page
    .getByLabel("Name of the group collection", { exact: true })
    .fill("City hosts");
  await page.getByRole("button", { name: "Save Group Collection" }).click();
  await expect(
    page.getByRole("button", { name: "City hosts 0 groups" }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("No group collections yet.")).toBeVisible();
  await page
    .getByRole("button", { name: "Post Templates", exact: true })
    .click();
  await page.getByRole("button", { name: "Categories", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("dialog", { name: "Manage Categories" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(
    page.getByText("No categories yet.", { exact: true }),
  ).toBeVisible();
});
test("Compose expands collections once and refuses oversized audiences", async ({
  page,
}) => {
  const stamp = new Date().toISOString();
  const groups = Array.from({ length: 51 }, (_, index) => ({
    id: `44444444-4444-4444-8444-${String(index + 1).padStart(12, "0")}`,
    user_id: viewer,
    identity: `fixture${index}`,
    url: `https://www.facebook.com/groups/fixture${index}/`,
    title: `Fixture group ${index + 1}`,
    destination: "",
    accommodation: "",
    audience: "",
    evidence: "",
    source: "manual",
    notes: "",
    review_status: "review_required",
    rule_evidence: "",
    last_reviewed_at: null,
    created_at: stamp,
    updated_at: stamp,
  }));
  await page.route("**/api/groups", (route) =>
    route.fulfill({
      json: {
        viewer_id: viewer,
        groups,
        stats: { total: 51, reviewed: 0, needsReview: 51 },
      },
    }),
  );
  await page.route("**/api/library", (route) =>
    route.fulfill({
      json: {
        viewer_id: viewer,
        categories: [],
        assignments: [],
        collections: [
          {
            id: collectionId,
            user_id: viewer,
            name: "All groups",
            revision: 1,
            group_ids: groups.map((group) => group.id),
            created_at: stamp,
            updated_at: stamp,
          },
          {
            id: catId,
            user_id: viewer,
            name: "First group",
            revision: 1,
            group_ids: [groups[0]!.id],
            created_at: stamp,
            updated_at: stamp,
          },
        ],
      },
    }),
  );
  await page.goto("/dashboard/compose");
  await page
    .getByRole("button", { name: "Advanced selector", exact: true })
    .click();
  await page
    .getByLabel("Group collection", { exact: true })
    .selectOption(collectionId);
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "exceeds the remaining audience capacity" }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /Fixture group 1 / }),
  ).not.toBeChecked();
  await page
    .getByLabel("Group collection", { exact: true })
    .selectOption(catId);
  await expect(
    page.getByRole("checkbox", { name: /Fixture group 1 / }),
  ).toBeChecked();
  await page
    .getByLabel("Group collection", { exact: true })
    .selectOption(catId);
  await expect(
    page.getByText("1/50 selected.", { exact: false }),
  ).toBeVisible();
});
