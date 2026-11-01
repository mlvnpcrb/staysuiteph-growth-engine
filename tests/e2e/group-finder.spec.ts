import { test, expect } from "@playwright/test";
test("AI Group Finder is the reference feature, without the removed hospitality assessment", async ({
  page,
}) => {
  await page.goto("/dashboard/group-finder");
  await expect(
    page.getByRole("heading", { name: "AI Group Finder", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Planned · not implemented", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Accommodation", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Find search ideas" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Back to Compose" }),
  ).toHaveAttribute("href", "/dashboard/compose");
});
