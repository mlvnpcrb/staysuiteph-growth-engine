import { chromium, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const extensionPath = resolve("apps/extension/build/chrome-mv3-prod");
const profile = await mkdtemp(join(tmpdir(), "staysuite-extension-test-"));
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {}),
    args: ["--enable-unsafe-extension-debugging"],
    ignoreDefaultArgs: ["--disable-extensions"],
  });
  // CDP's supported install command honors Chrome administrative policy.
  const session = await context.browser().newBrowserCDPSession();
  const { id } = await session.send("Extensions.loadUnpacked", {
    path: extensionPath,
  });
  const popup = await context.newPage();
  const errors = [];
  popup.on("pageerror", (error) => errors.push(error.message));
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await expect(
    popup.getByRole("heading", { name: "Your next connection starts here." }),
  ).toBeVisible();
  await expect(
    popup.getByText("Not connected", { exact: false }),
  ).toBeVisible();
  await expect(
    popup.getByText(/pairing is planned for a later phase/),
  ).toBeVisible();
  // Fulfill the dashboard navigation locally: no real backend or account is contacted.
  await context.route("http://localhost:3000/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Dashboard navigation fixture</h1>",
    }),
  );
  const opened = context.waitForEvent("page");
  await popup.getByRole("button", { name: "Open dashboard" }).click();
  const dashboard = await opened;
  await expect(dashboard).toHaveURL("http://localhost:3000/dashboard/overview");
  await expect(
    dashboard.getByRole("heading", { name: "Dashboard navigation fixture" }),
  ).toBeVisible();
  if (errors.length)
    throw new Error(`Popup runtime errors: ${errors.join("; ")}`);
  console.log(
    "PASS: real unpacked MV3 installation, popup rendering, and dashboard navigation (mock destination; no pairing/backend integration claimed)",
  );
} catch (error) {
  if (
    error instanceof Error &&
    /disabled by the administrator|Method not available/.test(error.message)
  ) {
    console.error(
      `BLOCKED: unpacked extension installation is unavailable in this browser: ${error.message}`,
    );
    process.exitCode = 2;
  } else {
    throw error;
  }
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
}
