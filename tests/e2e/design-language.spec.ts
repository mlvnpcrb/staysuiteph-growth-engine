import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("coastal design language has a reduced-motion poster and accessible themes", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/design-language");
  await expect(
    page.getByRole("heading", { name: "A clearer way to grow." }),
  ).toBeVisible();
  const stage = page.locator(".coastal-review .ss-stage");
  await expect(stage).toHaveAttribute("data-still", "true");
  await expect(stage.locator(".coastal-review-save .ss-states__item[data-on]")).toHaveText(
    "Review saved",
  );
  await expect(
    page.getByText("Illustrated example.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Replay group review illustration" })
    .click();
  await expect(
    page.locator(".coastal-review .ss-stage .coastal-review-save .ss-states__item[data-on]"),
  ).toHaveText("Review saved");
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "Switch theme" }).click();
    await expect(page.locator("html")).toHaveClass(new RegExp(theme));
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});

test("Stageshow plays once, holds its result, and replays without backend writes", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") writes.push(request.url());
  });
  await page.goto("/design-language");
  const stage = page.locator(".coastal-review .ss-stage");
  await expect(stage).toHaveAttribute("data-mark", "saved", { timeout: 20000 });
  await expect(stage.locator(".coastal-review-save .ss-states__item[data-on]")).toHaveText(
    "Review saved",
  );
  await page
    .getByRole("button", { name: "Replay group review illustration" })
    .click();
  await expect(
    page.locator(".coastal-review .ss-stage .coastal-review-save .ss-states__item[data-on]"),
  ).toHaveText("Save review");
  await expect(page.locator(".coastal-review .ss-stage")).toHaveAttribute(
    "data-mark",
    "saved",
    { timeout: 20000 },
  );
  expect(writes).toEqual([]);
});
