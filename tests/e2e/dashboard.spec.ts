import { settleTheme } from "./helpers/settle-theme";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { navigation } from "../../packages/types/src";
test("responsive shell, navigation, and honest placeholders", async ({
  page,
}) => {
  await page.goto("/dashboard/compose");
  await expect(page.getByRole("heading", { name: "Compose" })).toBeVisible();
  await expect(page.getByText("Demo workspace", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const menu = page.getByRole("button", { name: "Open navigation" });
  if (await menu.isVisible()) await menu.click();
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  for (const section of navigation)
    await expect(
      nav.getByRole("link", { name: section.label, exact: false }),
    ).toHaveAttribute("href", `/dashboard/${section.slug}`);
  await nav.getByRole("link", { name: "All groups", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "All groups", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Saved groups are unavailable/)).toBeVisible();
  await page.goto("/dashboard/compose");
  await expect(page.getByRole("heading", { name: "Compose" })).toBeVisible();
});
test("theme selection persists across reload", async ({ page }) => {
  await page.goto("/dashboard/compose");
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  const theme = await page.locator("html").getAttribute("class");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("class", theme ?? "");
});
test("sync denies unauthenticated requests even in demo mode", async ({
  request,
}) => {
  const response = await request.get("/api/v1/sync");
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toContain("no-store");
});
test("unknown sections return not found", async ({ page }) => {
  await page.goto("/dashboard/not-a-section");
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
});

test("non-demo dashboard redirects to setup login", async ({ request }) => {
  const response = await request.get(
    "http://127.0.0.1:3001/dashboard/compose",
    { maxRedirects: 0 },
  );
  expect(response.status()).toBe(307);
  expect(response.headers()["location"]).toBe("/login");
});
test("non-demo login explains missing configuration", async ({ page }) => {
  await page.goto("http://127.0.0.1:3001/login");
  await expect(
    page.getByText(/Authentication is not configured/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toHaveCount(0);
});

test("every section renders its own heading", async ({ page }) => {
  for (const section of navigation) {
    await page.goto(`/dashboard/${section.slug}`);
    await expect(
      page.getByRole("heading", {
        name: section.label,
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});


test("sync reports unavailable backend without granting a demo identity", async ({
  request,
}) => {
  const response = await request.get("http://127.0.0.1:3001/api/v1/sync", {
    headers: { Authorization: "Bearer test-token" },
  });
  expect(response.status()).toBe(503);
  expect(await response.json()).toEqual({ error: "backend_not_configured" });
});


test("auth callback failure is fixed-origin and non-cacheable", async ({
  request,
}) => {
  const response = await request.get(
    "http://localhost:3001/auth/callback?next=https://evil.example",
    { maxRedirects: 0 },
  );
  expect(response.status()).toBe(307);
  expect(response.headers()["location"]).toBe(
    "http://localhost:3001/login?error=callback",
  );
  expect(response.headers()["cache-control"]).toContain("no-store");
});

test("Compose has no automated WCAG A/AA violations in either theme", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/dashboard/compose");
  await expect(page.locator("html")).toHaveClass(/light/);
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") {
      await page.getByRole("button", { name: "Toggle color theme" }).click();
      await expect(page.locator("html")).toHaveClass(/dark/);
    }
    await settleTheme(page, theme);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(result.violations).toEqual([]);
  }
});

test("reference alignment removes standalone analytics and labels planned features", async ({
  page,
}) => {
  await page.goto("/dashboard/compose");
  const menu = page.getByRole("button", { name: "Open navigation" });
  if (await menu.isVisible()) await menu.click();
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.getByRole("link", { name: "Analytics" })).toHaveCount(0);
  for (const name of ["AI Studio", "Lead Radar"])
    await expect(
      nav.getByRole("link", { name: new RegExp(name) }),
    ).toContainText("Not implemented");
  await page.goto("/dashboard/analytics");
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
  await page.goto("/dashboard/ai-post-studio");
  await expect(
    page.getByText("Planned · not implemented", { exact: true }),
  ).toBeVisible();
});


test("reference top navigation remains visible and keyboard accessible", async ({ page }) => {
  await page.goto("/dashboard/compose");
  const nav=page.getByRole("navigation",{name:"Main navigation"});
  const compose=nav.getByRole("link",{name:"Compose",exact:true});
  await expect(compose).toBeVisible();await expect(compose).toHaveAttribute("aria-current","page");
  await compose.focus();await page.keyboard.press("Tab");await expect(nav.getByRole("link",{name:/^Templates/})).toBeFocused();
  await expect(page.getByRole("button",{name:"Open navigation"})).toHaveCount(0);
});
