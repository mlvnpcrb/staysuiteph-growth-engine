import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { settleTheme } from "./helpers/settle-theme";
import type { RadarSettings, RadarLead } from "@staysuite/validation";
const owner = "11111111-1111-4111-8111-111111111111",
  group = "22222222-2222-4222-8222-222222222222",
  id = "33333333-3333-4333-8333-333333333333",
  scope = "personal:12345";
test("Radar settings and inbox use persistent scoped services without starting scanning", async ({
  page,
}, testInfo) => {
  const stamp = new Date().toISOString();
  let settings: RadarSettings = {
    user_id: owner,
    scope,
    revision: 1,
    group_ids: [group],
    keyword_rules: { exact: ["looking for"], broad: [], negative: ["free"] },
    scan_interval: 30,
    in_page_notifications: true,
    desktop_notifications: true,
    reply_preferences: {
      style: "helpful",
      selling: "soft",
      directness: "balanced",
      context: "",
    },
    created_at: stamp,
    updated_at: stamp,
  };
  let leads: RadarLead[] = [
    {
      id,
      user_id: owner,
      scope,
      group_id: group,
      group_identity: "fixture",
      group_name: "Fixture group",
      post_id: "123",
      url: "https://www.facebook.com/groups/fixture/posts/123/",
      author: "Fixture enquiry",
      text: "Looking for a room this weekend.",
      matched_keywords: ["looking for"],
      stage: "new",
      is_read: false,
      is_starred: false,
      note: "",
      revision: 1,
      discovered_at: stamp,
      post_created_at: null,
      updated_at: stamp,
    },
  ];
  let settingsWrites = 0;
  await page.route("**/api/groups", (route) =>
    route.fulfill({
      json: {
        viewer_id: owner,
        groups: [
          {
            id: group,
            user_id: owner,
            identity: "fixture",
            url: "https://www.facebook.com/groups/fixture/",
            title: "Fixture group",
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
          },
        ],
        stats: { total: 1, reviewed: 0, needsReview: 1 },
      },
    }),
  );
  await page.route("**/api/radar**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.pathname.endsWith("/export"))
      return route.fulfill({
        body: "Author,Post text\r\nFixture enquiry,Looking for a room\r\n",
        headers: {
          "content-type": "text/csv",
          "content-disposition": 'attachment; filename="staysuite-leads.csv"',
        },
      });
    if (request.method() === "GET") {
      let rows = leads;
      const search = url.searchParams.get("search") ?? "";
      if (search)
        rows = rows.filter((row) =>
          `${row.author} ${row.text}`
            .toLowerCase()
            .includes(search.toLowerCase()),
        );
      if (url.searchParams.get("status") === "starred")
        rows = rows.filter((row) => row.is_starred);
      return route.fulfill({
        json: {
          viewer_id: owner,
          scope,
          settings,
          leads: rows,
          next_cursor: null,
          server_time: new Date().toISOString(),
          capabilities: {
            scanning: false,
            ai: false,
            auto_reply: false,
            webhooks: false,
          },
        },
      });
    }
    const input = request.postDataJSON();
    if (input.operation === "save_settings") {
      expect(input.revision).toBe(settings.revision);
      settings = {
        ...settings,
        ...input.settings,
        revision: settings.revision + 1,
      };
      settingsWrites++;
      return route.fulfill({ json: { settings } });
    }
    if (input.operation === "update_lead") {
      const lead = leads.find((row) => row.id === input.id)!;
      expect(input.revision).toBe(lead.revision);
      Object.assign(lead, input.changes, { revision: lead.revision + 1 });
      return route.fulfill({ json: { lead } });
    }
    if (input.operation === "delete_lead") {
      leads = [];
      return route.fulfill({ json: { deleted: 1 } });
    }
    return route.fulfill({
      status: 400,
      json: { error: "Unexpected command" },
    });
  });
  await page.goto(
    `/dashboard/lead-radar?scope=${encodeURIComponent(scope)}&viewer=${owner}`,
  );
  await expect(
    page.getByRole("heading", { name: "Lead Radar", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Scanning unavailable" }),
  ).toBeDisabled();
  await page
    .getByLabel("Broad keywords", { exact: true })
    .fill("beach accommodation");
  await page
    .getByRole("button", { name: "Save Settings", exact: true })
    .click();
  await expect(
    page.getByText("Settings saved. Scanning remains unavailable.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Broad keywords", { exact: true })).toHaveValue(
    "beach accommodation",
  );
  expect(settingsWrites).toBe(1);
  await page
    .getByRole("button", {
      name: "Star lead from Fixture enquiry",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Unstar lead from Fixture enquiry" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByLabel("Stage for Fixture enquiry", { exact: true })
    .selectOption("conversation");
  await expect(
    page.getByLabel("Stage for Fixture enquiry", { exact: true }),
  ).toHaveValue("conversation");
  await page.getByRole("button", { name: "Edit note" }).click();
  await page.getByLabel("Lead note").fill("Follow up tomorrow");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(
    page.getByText("Follow up tomorrow", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mark read", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mark unread", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Lead status", { exact: true }).selectOption("starred");
  await expect(
    page.getByRole("heading", { name: "Fixture enquiry", exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("staysuite-leads.csv");
  await expect(page.getByRole("tab", { name: "Targeting" })).toBeVisible();
  await page.getByRole("tab", { name: "Targeting" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Automation", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Scan Now", exact: true }),
  ).toBeDisabled();
  await page.getByRole("tab", { name: "Targeting", exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath("radar-workspace.png"),
    fullPage: true,
  });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Toggle color theme", exact: true })
    .click();
  await settleTheme(page, "dark");
  await page.screenshot({
    path: testInfo.outputPath("radar-workspace-dark.png"),
    fullPage: true,
  });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete lead" }).click();
  await expect(page.getByText("No leads yet.", { exact: false })).toBeVisible();
});
test("Radar asks for a profile connection and rejects a mismatched StaySuite account", async ({
  page,
}) => {
  await page.route("**/api/groups", (route) =>
    route.fulfill({
      json: {
        viewer_id: owner,
        groups: [],
        stats: { total: 0, reviewed: 0, needsReview: 0 },
      },
    }),
  );
  let radarReads = 0;
  await page.route("**/api/radar**", (route) => {
    radarReads++;
    return route.fulfill({
      status: 400,
      json: { error: "Unexpected request" },
    });
  });
  await page.goto("/dashboard/lead-radar");
  await expect(
    page.getByRole("heading", { name: "Connect your Facebook profile" }),
  ).toBeVisible();
  await page.goto(`/dashboard/lead-radar?scope=${scope}&viewer=${group}`);
  await expect(
    page.getByText(
      "Your StaySuite account changed. Reconnect the extension before opening this profile.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(radarReads).toBe(0);
});
