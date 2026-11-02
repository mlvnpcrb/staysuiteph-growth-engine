import { test, expect } from "@playwright/test";
test("reference Compose uses audience first, real dialogs and a working link action", async ({
  page,
}, testInfo) => {
  await page.route("**/api/groups", (route) =>
    route.fulfill({
      json: { groups: [], stats: { total: 0, reviewed: 0, needsReview: 0 } },
    }),
  );
  await page.goto("/dashboard/compose");
  const audience = await page
    .getByRole("heading", { name: "Choose your audience", exact: true })
    .boundingBox();
  const content = await page
    .getByRole("heading", { name: "Create your content", exact: true })
    .boundingBox();
  expect(audience!.y).toBeLessThan(content!.y);
  await expect(page.getByText("Group campaigns", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Find a target group")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Advanced selector", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Select groups", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Select groups", exact: true }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Link", exact: true }).click();
  await page.getByLabel("Link URL").fill("https://user:password@example.com");
  await page.getByRole("button", { name: "Insert link", exact: true }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Add a link", exact: true })
      .getByRole("alert"),
  ).toContainText("without credentials");
  await page.getByLabel("Link URL").fill("https://example.com/offer");
  await page.getByRole("button", { name: "Insert link", exact: true }).click();
  await expect(page.getByLabel("Post text", { exact: true })).toHaveValue(
    "https://example.com/offer",
  );
  await page.getByText("Advanced Automation Settings", { exact: true }).click();
  await expect(
    page.getByLabel("Posting method", { exact: true }),
  ).toBeVisible();
  await page.getByText("Advanced Automation Settings", { exact: true }).click();
  await expect(
    page.getByLabel("Posting method", { exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Schedule", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Review your post", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Review your post", exact: true }).getByRole("button", {
      name: "Post Now",
      exact: true,
    }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Preview", exact: true }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("reference-compose.png"),
    fullPage: true,
  });
});
test("saved-template picker preserves a dirty post until replacement is confirmed", async ({
  page,
}) => {
  const owner = "11111111-1111-4111-8111-111111111111",
    id = "22222222-2222-4222-8222-222222222222";
  const template = {
    id,
    user_id: owner,
    name: "Saved weekend offer",
    text: "Saved post body",
    assets: [],
    state: "ready",
    revision: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const groupId = "66666666-6666-4666-8666-666666666666";
  await page.route("**/api/groups", (route) =>
    route.fulfill({
      json: {
        viewer_id: owner,
        groups: [
          {
            id: groupId,
            user_id: owner,
            identity: "12345",
            url: "https://www.facebook.com/groups/12345/",
            title: "Fixture audience",
            destination: "",
            accommodation: "",
            audience: "",
            evidence: "",
            source: "manual",
            notes: "",
            review_status: "review_required",
            rule_evidence: "",
            last_reviewed_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        stats: { total: 1, reviewed: 0, needsReview: 1 },
      },
    }),
  );
  let writes = 0;
  await page.route("**/api/templates**", (route) => {
    if (route.request().method() !== "GET") writes++;
    return route.fulfill({
      json: new URL(route.request().url()).searchParams.has("id")
        ? { template, assets: [], viewer_id: owner }
        : { templates: [template], viewer_id: owner },
    });
  });
  await page.goto("/dashboard/compose");
  await page
    .getByLabel("Post text", { exact: true })
    .fill("Keep my current draft");
  await page
    .getByRole("button", { name: "Advanced selector", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /Fixture audience/ }).check();
  await page
    .getByRole("button", { name: "Done selecting groups", exact: true })
    .click();
  await page.getByText("Advanced Automation Settings", { exact: true }).click();
  await page.getByLabel("Pause length (minutes)", { exact: true }).fill("3");
  await page.getByText("Advanced Automation Settings", { exact: true }).click();
  await page
    .getByRole("button", { name: "Post saved templates", exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: /Saved weekend offer/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Post saved templates", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close templates" }).click();
  await expect(page.getByLabel("Post text", { exact: true })).toHaveValue(
    "Keep my current draft",
  );
  await page
    .getByRole("button", { name: "Post saved templates", exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /Saved weekend offer/ }).click();
  await expect(page.getByLabel("Post text", { exact: true })).toHaveValue(
    "Saved post body",
  );
  await expect(
    page.getByRole("button", {
      name: "Remove Fixture audience from audience",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByText("Advanced Automation Settings", { exact: true }).click();
  await expect(
    page.getByLabel("Pause length (minutes)", { exact: true }),
  ).toHaveValue("3");
  await expect(page).toHaveURL(/\/dashboard\/compose$/);
  expect(writes).toBe(0);
});
test("Templates follows the reference split library with selection and name sorting", async ({
  page,
}) => {
  const viewer = "11111111-1111-4111-8111-111111111111";
  await page.route("**/api/templates", (route) =>
    route.fulfill({
      json: {
        viewer_id: viewer,
        templates: ["Zebra", "Alpha"].map((name, index) => ({
          id: index
            ? "22222222-2222-4222-8222-222222222222"
            : "33333333-3333-4333-8333-333333333333",
          user_id: viewer,
          name,
          text: `${name} post`,
          assets: [],
          revision: 1,
          state: "ready",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })),
      },
    }),
  );
  await page.goto("/dashboard/templates");
  await expect(
    page.getByRole("button", { name: "Post Templates", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("heading", { name: "Zebra", exact: true }),
  ).toBeVisible();
  await page.getByText("Sort & Filter", { exact: true }).click();
  await page.getByLabel("Sort by", { exact: true }).selectOption("name-asc");
  await page.getByText("Sort & Filter", { exact: true }).click();
  await expect(page.locator(".ts-tags-list strong").first()).toHaveText(
    "Alpha",
  );
  await page.getByRole("button", { name: /Alpha Alpha post/ }).click();
  await expect(
    page.getByRole("heading", { name: "Alpha", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search templates", { exact: true }).fill("Zebra");
  await expect(page.locator(".ts-tags-list li")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Zebra", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
