import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
test("built popup renders under its CSP and opens the dashboard (HTTP harness, not an installed extension)", async ({
  context,
  page,
}) => {
  const directory = resolve("apps/extension/build/chrome-mv3-prod");
  const manifest = JSON.parse(
    await readFile(`${directory}/manifest.json`, "utf8"),
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.route("http://extension-fixture.test/**", async (route) => {
    const file =
      basename(new URL(route.request().url()).pathname) || "popup.html";
    const types: Record<string, string> = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".png": "image/png",
    };
    const contentType = types[extname(file)] ?? "application/octet-stream";
    await route.fulfill({
      body: await readFile(`${directory}/${file}`),
      contentType,
      headers: {
        "Content-Security-Policy":
          manifest.content_security_policy.extension_pages,
      },
    });
  });
  await context.route("http://localhost:3000/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Dashboard destination fixture</h1>",
    }),
  );
  await page.goto("http://extension-fixture.test/popup.html");
  await expect(
    page.getByRole("heading", { name: "Your next connection starts here." }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /No Facebook access, account monitoring, or publishing is active/,
    ),
  ).toBeVisible();
  await expect(
    page.getByText(/pairing is planned for a later phase/),
  ).toBeVisible();
  const opened = context.waitForEvent("page");
  await page.getByRole("button", { name: "Open dashboard" }).click();
  const destination = await opened;
  await expect(destination).toHaveURL(
    "http://localhost:3000/dashboard/overview",
  );
  await expect(
    destination.getByRole("heading", { name: "Dashboard destination fixture" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
