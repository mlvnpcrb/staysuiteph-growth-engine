import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  cadenceSchema,
  nextScheduleOccurrence,
  type CampaignSchedule,
} from "../../packages/validation/src/schedules";
import { manilaLocal } from "../../apps/web/src/components/automations/schedule-api";
const viewer = "11111111-1111-4111-8111-111111111111",
  campaignId = "22222222-2222-4222-8222-222222222222",
  id = "33333333-3333-4333-8333-333333333333";
test("schedules persist paused, require review, project a calendar, pause and delete", async ({
  page,
}, testInfo) => {
  let schedules: CampaignSchedule[] = [];
  let campaignWrites = 0;
  const operations: string[] = [];
  await page.route("**/api/campaigns", (route) => {
    if (route.request().method() !== "GET") campaignWrites++;
    return route.fulfill({
      json: {
        viewer_id: viewer,
        campaigns: [
          {
            id: campaignId,
            revision: 3,
            state: "ready",
            title: "Demo scheduled offer",
            description: "",
            plan: { text: "Demo post" },
            created_at: new Date().toISOString(),
          },
        ],
      },
    });
  });
  await page.route("**/api/schedules**", (route) => {
    const request = route.request();
    if (request.method() === "GET")
      return route.fulfill({
        json: { viewer_id: viewer, schedules, runs: [] },
      });
    expect(request.headers()["x-staysuite-viewer"]).toBe(viewer);
    const body = request.postDataJSON();
    operations.push(body.operation);
    if (body.operation === "create") {
      const cadence = cadenceSchema.parse(body.cadence);
      expect(cadence.weekdays).toEqual([1, 3]);
      schedules = [
        {
          id,
          user_id: viewer,
          campaign_id: campaignId,
          cadence,
          state: "paused",
          revision: 1,
          approved_digest: null,
          next_run_at: nextScheduleOccurrence(cadence, Date.now()),
          current_run_id: null,
          stop_reason: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
    } else if (body.operation === "delete") {
      schedules = [];
      return route.fulfill({
        json: { result: { deleted_id: id }, viewer_id: viewer },
      });
    } else if (body.operation === "enable") {
      expect(body.reviewed).toBe(true);
      schedules[0] = {
        ...schedules[0]!,
        state: "enabled",
        revision: schedules[0]!.revision + 1,
        approved_digest: "fixture",
      };
    } else if (body.operation === "pause") {
      schedules[0] = {
        ...schedules[0]!,
        state: "paused",
        revision: schedules[0]!.revision + 1,
      };
    }
    return route.fulfill({
      json: { schedule: schedules[0], viewer_id: viewer },
    });
  });
  await page.goto("/dashboard/automations");
  await expect(
    page.getByRole("heading", { name: "Nothing running yet" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create New", exact: true }).click();
  await page.getByLabel("Campaign", { exact: true }).selectOption(campaignId);
  await page.getByLabel("Repeat", { exact: true }).selectOption("weekly");
  await page
    .getByLabel("Start date and time", { exact: true })
    .fill(manilaLocal(new Date(Date.now() + 86400000).toISOString()));
  await expect(
    page.getByRole("button", { name: "Save schedule", exact: true }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: "Mon", exact: true }).check();
  await page.getByRole("checkbox", { name: "Wed", exact: true }).check();
  await page
    .getByRole("button", { name: "Save schedule", exact: true })
    .click();
  await expect(
    page.locator(".schedule-editor").getByRole("status"),
  ).toContainText("Schedule saved and paused");
  await expect(
    page.getByRole("button", { name: "Enable schedule", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: /I reviewed this exact campaign/ })
    .check();
  await page
    .getByRole("button", { name: "Enable schedule", exact: true })
    .click();
  await expect(
    page.locator(".schedule-editor").getByRole("status"),
  ).toContainText("Schedule enabled");
  await page
    .getByRole("button", { name: "Close schedule", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByText("weekly · enabled", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(
    page.locator(".automation-calendar td button").first(),
  ).toContainText("Demo scheduled offer");
  await page.screenshot({
    path: testInfo.outputPath("automation-calendar.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Previous month" }).click();
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(
    page.getByText("No enabled occurrences or recorded runs for this period.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(
    page.getByText("weekly · paused", { exact: true }),
  ).toBeVisible();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Nothing running yet" }),
  ).toBeVisible();
  expect(operations).toEqual(["create", "enable", "pause", "delete"]);
  expect(campaignWrites).toBe(0);
});

test("Compose saves the exact draft before planning a paused schedule without approving publication", async ({
  page,
}) => {
  const groupId = "44444444-4444-4444-8444-444444444444";
  const commands: string[] = [];
  let savedId = "";
  await page.route("**/api/groups", (route) =>
    route.fulfill({
      json: {
        viewer_id: viewer,
        groups: [
          {
            id: groupId,
            user_id: viewer,
            identity: "98765",
            url: "https://www.facebook.com/groups/98765/",
            title: "Demo schedule group",
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
  await page.route("**/api/campaigns", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { viewer_id: viewer, campaigns: [] } });
    const command = route.request().postDataJSON();
    commands.push(command.command);
    savedId = command.id;
    expect(command.command).toBe("create");
    expect(command.payload.plan.text).toBe("Exact scheduled draft");
    expect(command.payload.plan.groupIds).toEqual([groupId]);
    return route.fulfill({
      json: {
        viewer_id: viewer,
        job: {
          ...command.payload,
          id: command.id,
          user_id: viewer,
          actor_id: null,
          actor_type: "personal",
          state: "draft",
          revision: 1,
          approved_digest: null,
          digest: "fixture",
          next_eligible_at: new Date().toISOString(),
          stop_reason: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          targets: [
            {
              id: groupId,
              campaign_id: command.id,
              group_id: groupId,
              position: 0,
              state: "queued",
              attempt_token: null,
              lease_until: null,
              post_url: null,
              receipt_source: null,
            },
          ],
          media: [],
        },
      },
    });
  });
  await page.route("**/api/schedules**", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: { viewer_id: viewer, schedules: [], runs: [] },
      });
    const body = route.request().postDataJSON();
    expect(body.operation).toBe("create");
    expect(body.campaign_id).toBe(savedId);
    expect(body.revision).toBe(1);
    const cadence = cadenceSchema.parse(body.cadence);
    return route.fulfill({
      json: {
        viewer_id: viewer,
        schedule: {
          id,
          user_id: viewer,
          campaign_id: savedId,
          cadence,
          state: "paused",
          revision: 1,
          approved_digest: null,
          next_run_at: cadence.starts_at,
          current_run_id: null,
          stop_reason: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      },
    });
  });
  await page.goto("/dashboard/compose");
  await page
    .getByLabel("Post text", { exact: true })
    .fill("Exact scheduled draft");
  await page
    .getByRole("button", { name: "Advanced selector", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /Demo schedule group/ }).check();
  await page
    .getByRole("button", { name: "Done selecting groups", exact: true })
    .click();
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Schedule Post", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save schedule", exact: true })
    .click();
  await expect(
    page.locator(".schedule-editor").getByRole("status"),
  ).toContainText("Schedule saved and paused");
  expect(commands).toEqual(["create"]);
});
test("Activity displays archived submission receipts separately from run completion", async ({
  page,
}) => {
  const runId = "55555555-5555-4555-8555-555555555555";
  await page.route("**/api/campaigns", (route) =>
    route.fulfill({ json: { viewer_id: viewer, campaigns: [] } }),
  );
  await page.route("**/api/schedules", (route) =>
    route.fulfill({
      json: {
        viewer_id: viewer,
        schedules: [],
        runs: [
          {
            id: runId,
            user_id: viewer,
            schedule_id: null,
            campaign_id: campaignId,
            scheduled_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
            state: "completed",
            outcomes: [
              {
                id,
                campaign_id: campaignId,
                group_id: id,
                position: 0,
                state: "pending_admin",
                attempt_token: id,
                lease_until: null,
                post_url: "https://www.facebook.com/groups/98765/posts/123/",
                receipt_source: "extension_report",
              },
            ],
          },
        ],
      },
    }),
  );
  await page.goto("/dashboard/activity");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Scheduled runs", exact: true }),
  ).toBeVisible();
  await page.getByText("Submission outcomes", { exact: true }).click();
  await expect(
    page.getByText("Group 1: pending_admin", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View post", exact: true }),
  ).toHaveAttribute("href", "https://www.facebook.com/groups/98765/posts/123/");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export scheduled runs", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "staysuite-scheduled-runs.csv",
  );
});
