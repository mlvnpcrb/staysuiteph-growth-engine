import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { settleTheme } from "./helpers/settle-theme";
test("campaign preparation validates attachments, binds approval and never publishes", async ({
  page,
}, testInfo) => {
  let writes = 0;
  await page.route("**/api/groups", (route) => {
    if (route.request().method() !== "GET") {
      writes++;
      return route.fulfill({
        status: 400,
        json: { error: "Unexpected write" },
      });
    }
    return route.fulfill({
      json: {
        groups: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            user_id: "22222222-2222-4222-8222-222222222222",
            identity: "fixture",
            url: "https://www.facebook.com/groups/fixture/",
            title: "Demo Staycation Group",
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
    });
  });
  await page.goto("/dashboard/campaigns");
  const approve = page.getByRole("button", {
    name: "Approve plan (not publish)",
  });
  await expect(approve).toBeDisabled();
  await page
    .getByLabel("Post text", { exact: true })
    .fill("Demo accommodation offer");
  await page.getByRole("checkbox", { name: /Demo Staycation Group/ }).check();
  const consent = page.getByRole("checkbox", {
    name: /I reviewed this exact text/,
  });
  await consent.check();
  await approve.click();
  await expect(page.getByRole("status")).toContainText(
    "No posts have been sent",
  );
  await page
    .getByLabel("Post text", { exact: true })
    .fill("Changed demo offer");
  await expect(consent).not.toBeChecked();
  await expect(approve).toBeDisabled();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1cAAAAASUVORK5CYII=",
    "base64",
  );
  await page
    .getByLabel("Choose media or drop files here")
    .setInputFiles({ name: "demo.png", mimeType: "image/png", buffer: png });
  await expect(
    page.getByRole("img", { name: "Attachment 1: demo.png" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("campaign-preparation.png"),
    fullPage: true,
  });
  await page.getByLabel("Choose media or drop files here").setInputFiles({
    name: "pretend.png",
    mimeType: "image/png",
    buffer: Buffer.from("<svg/>"),
  });
  await expect(page.locator(".group-error[role=alert]")).toContainText(
    "recognized signature",
  );
  await page.getByLabel("Choose media or drop files here").setInputFiles({
    name: "duplicate.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(page.locator(".group-error[role=alert]")).toContainText(
    "already attached",
  );
  await page.getByRole("button", { name: "Remove demo.png" }).click();
  await expect(
    page.getByRole("img", { name: "Attachment 1: demo.png" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Start bulk posting/ }),
  ).toBeDisabled();
  await page.getByText("Media help", { exact: true }).click();
  await expect(page.getByText(/Files stay in this browser tab/)).toBeVisible();
  for (const scheme of ["light", "dark"] as const) {
    if (scheme === "dark")
      await page.getByRole("button", { name: "Toggle color theme" }).click();
    await settleTheme(page, scheme);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
  expect(writes).toBe(0);
});
test("real API accepts the requested loopback origin and rejects foreign origins", async ({
  request,
}) => {
  const url = "http://127.0.0.1:3001/api/campaigns";
  const local = await request.post(url, {
    headers: { Origin: "http://127.0.0.1:3001" },
    data: {},
  });
  expect(local.status()).toBe(503);
  expect(await local.json()).toEqual({
    error: "Campaign storage is not connected.",
  });
  expect(
    (
      await request.post(url, {
        headers: { Origin: "https://foreign.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
});
test("text tools, accessible help and reviewed variations work without enabling cloud saving", async ({
  page,
}, testInfo) => {
  await page.route("**/api/groups", (route) =>
    route.fulfill({
      json: { groups: [], stats: { total: 0, reviewed: 0, needsReview: 0 } },
    }),
  );
  await page.route("**/api/campaigns", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Campaign storage activation is pending." },
    }),
  );
  await page.goto("/dashboard/campaigns");
  const field = page.getByLabel("Post text", { exact: true });
  const offer = "Weekend in Makati\n₱2,500/night · 2 guests.";
  await field.fill(offer);
  await page
    .getByRole("button", { name: "Bold lettering", exact: true })
    .focus();
  await expect(
    page
      .getByRole("tooltip")
      .filter({ hasText: "Style selected letters using" }),
  ).toBeVisible();
  await field.focus();
  await field.press("Control+Home");
  await field.press("Shift+End");
  await page
    .getByRole("button", { name: "Bold lettering", exact: true })
    .click();
  await expect(field).toHaveValue(
    "𝐖𝐞𝐞𝐤𝐞𝐧𝐝 𝐢𝐧 𝐌𝐚𝐤𝐚𝐭𝐢\n₱2,500/night · 2 guests.",
  );
  await page.getByRole("button", { name: "Undo text tool" }).click();
  await expect(field).toHaveValue(offer);
  await page
    .getByRole("button", { name: "Random variations", exact: true })
    .click();
  await page
    .getByLabel("Alternative opening lines, one per line")
    .fill("Hello accommodation seekers!");
  await page
    .getByRole("button", { name: "Generate variation", exact: true })
    .click();
  await expect(field).toHaveValue(offer);
  await page
    .getByRole("button", { name: "Use this variation", exact: true })
    .click();
  await expect(field).toHaveValue("Hello accommodation seekers!\n\n" + offer);
  await page
    .getByRole("button", { name: "Random variations", exact: true })
    .click();
  await field.fill("New draft");
  await expect(
    page.getByRole("button", { name: "Use this variation", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Save campaign privately", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /Start bulk posting/ }),
  ).toBeDisabled();
  await page.screenshot({
    path: testInfo.outputPath("campaign-text-tools.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
  ).toBe(false);
});
