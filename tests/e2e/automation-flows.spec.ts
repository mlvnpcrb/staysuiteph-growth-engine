import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { settleTheme } from "./helpers/settle-theme";
import {
  automationDefinitionSchema,
  type AutomationFlow,
  type CampaignJob,
} from "../../packages/validation/src/index";
const owner = "11111111-1111-4111-8111-111111111111",
  flowId = "22222222-2222-4222-8222-222222222222",
  jobId = "33333333-3333-4333-8333-333333333333",
  templateId = "44444444-4444-4444-8444-444444444444",
  groupId = "55555555-5555-4555-8555-555555555555",
  targetId = "66666666-6666-4666-8666-666666666666";
const stamp = new Date().toISOString();
async function fixture(page: Page) {
  let flow: AutomationFlow | null = null,
    job: CampaignJob | null = null,
    stale = false;
  const commands: string[] = [];
  let preparations = 0;
  let currentViewer = owner;
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
            title: "Fixture reviewed group",
            destination: "",
            accommodation: "",
            audience: "",
            evidence: "",
            source: "manual",
            notes: "",
            review_status: "reviewed",
            rule_evidence: "Fixture permission",
            last_reviewed_at: stamp,
            created_at: stamp,
            updated_at: stamp,
          },
        ],
        stats: { total: 1, reviewed: 1, needsReview: 0 },
      },
    }),
  );
  await page.route("**/api/templates", (route) =>
    route.fulfill({
      json: {
        viewer_id: owner,
        templates: [
          {
            id: templateId,
            user_id: owner,
            name: "Fixture template",
            text: "  Exact template body  ",
            assets: [],
            revision: 1,
            state: "ready",
            created_at: stamp,
            updated_at: stamp,
          },
        ],
      },
    }),
  );
  await page.route("**/api/schedules**", (route) =>
    route.fulfill({ json: { viewer_id: owner, schedules: [], runs: [] } }),
  );
  await page.route("**/api/campaigns**", (route) =>
    route.fulfill({
      json: new URL(route.request().url()).searchParams.has("id")
        ? { viewer_id: owner, job, assets: [] }
        : { viewer_id: owner, campaigns: job ? [job] : [] },
    }),
  );
  await page.route("**/api/automation-flows**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.pathname.endsWith("/prepare")) {
      expect(request.headers()["x-staysuite-viewer"]).toBe(owner);
      const input = request.postDataJSON();
      expect(input.template_id).toBe(templateId);
      expect(input.template_revision).toBe(1);
      expect(input.group_ids).toEqual([groupId]);
      expect(input.actor_id).toBe("12345");
      preparations++;
      job = {
        id: jobId,
        user_id: owner,
        title: "Fixture template",
        description: "",
        actor_id: "12345",
        actor_type: "personal",
        plan: {
          version: 1,
          text: "  Exact template body  ",
          groupIds: [groupId],
          intervalMinutes: 2,
          media: [],
        },
        settings: {
          method: "direct",
          pauseEvery: 1,
          pauseMinutes: 2,
          avoidNight: true,
          delayAfterFailure: true,
        },
        state: "draft",
        revision: 2,
        approved_digest: null,
        digest: "b".repeat(64),
        next_eligible_at: stamp,
        stop_reason: null,
        created_at: stamp,
        updated_at: stamp,
        media: [],
        targets: [
          {
            id: targetId,
            campaign_id: jobId,
            group_id: groupId,
            position: 0,
            state: "queued",
            attempt_token: null,
            lease_until: null,
            post_url: null,
            receipt_source: null,
          },
        ],
      };
      return route.fulfill({
        json: {
          viewer_id: owner,
          job,
          prepared: {
            request_id: input.request_id,
            campaign_id: jobId,
            template_id: templateId,
            template_revision: 1,
          },
        },
      });
    }
    if (request.method() === "GET")
      return route.fulfill({
        json: {
          viewer_id: currentViewer,
          flows: flow ? [flow] : [],
          events: [],
        },
      });
    const input = request.postDataJSON();
    expect(request.headers()["x-staysuite-viewer"]).toBe(owner);
    commands.push(input.operation);
    if (input.operation === "create") {
      flow = {
        id: flowId,
        user_id: owner,
        title: input.title,
        definition: automationDefinitionSchema.parse(input.definition),
        state: "paused",
        revision: 1,
        approved_digest: null,
        digest: "a".repeat(64),
        actor_id: null,
        actor_type: null,
        step_index: 0,
        post_index: 0,
        loop_counters: {},
        next_action_at: null,
        wait_until: null,
        occurrence_at: null,
        cycle_started_at: null,
        cycle: 0,
        current_schedule_id: null,
        stop_reason: null,
        created_at: stamp,
        updated_at: stamp,
      };
    } else if (input.operation === "enable") {
      expect(input.reviewed).toBe(true);
      expect(input.digest).toBe("a".repeat(64));
      expect(input.actor_id).toBe("12345");
      if (stale)
        return route.fulfill({
          status: 409,
          json: { error: "Template changed. Review again." },
        });
      flow = {
        ...flow!,
        state: "enabled",
        revision: flow!.revision + 1,
        approved_digest: input.digest,
        actor_id: input.actor_id,
        actor_type: input.actor_type,
        next_action_at: stamp,
      };
    } else if (input.operation === "pause")
      flow = { ...flow!, state: "paused", revision: flow!.revision + 1 };
    else if (input.operation === "delete") {
      flow = null;
      return route.fulfill({ json: { flow: null, deleted_id: flowId } });
    }
    return route.fulfill({ json: { flow } });
  });
  return {
    commands,
    get preparations() {
      return preparations;
    },
    makeStale() {
      stale = true;
    },
    changeGraph() {
      if (flow)
        flow = {
          ...flow,
          title: "Changed in another tab",
          revision: flow.revision + 1,
        };
    },
    switchOwner() {
      currentViewer = groupId;
      flow = null;
    },
  };
}
async function build(page: Page) {
  await page.goto("/dashboard/automations");
  await page
    .getByRole("button", { name: "Create automation flow", exact: true })
    .click();
  await page
    .getByLabel("Automation name", { exact: true })
    .fill("Fixture template flow");
  await page
    .getByText("Settings for new template posts", { exact: true })
    .click();
  await page.getByLabel("Facebook identity ID", { exact: true }).fill("12345");
  await page
    .getByLabel("Step 2 templates", { exact: true })
    .selectOption([templateId]);
  await page
    .getByLabel("Step 2 template groups", { exact: true })
    .selectOption([groupId]);
  await page.getByRole("button", { name: "Add Wait", exact: true }).click();
  await page.getByLabel("Step 3 wait minutes", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Add Loop", exact: true }).click();
  await page.getByLabel("Step 4 total passes", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Add Stop", exact: true }).click();
  await page
    .getByRole("button", { name: "Save automation", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Automation saved and paused" }),
  ).toBeVisible();
}
test("template flows save paused, persist ordered blocks, require exact review, enable, pause and delete", async ({
  page,
}, testInfo) => {
  const state = await fixture(page);
  await build(page);
  expect(state.preparations).toBe(1);
  await page
    .getByRole("button", { name: "Close flow editor", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "Open flow", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Edit automation",
    exact: true,
  });
  await expect(dialog.getByText("4. Loop", { exact: true })).toBeVisible();
  await dialog
    .getByRole("button", { name: "Review automation", exact: true })
    .click();
  await expect(dialog.locator(".flow-exact-text")).toHaveText(
    "  Exact template body  ",
  );
  await expect(
    dialog.getByRole("button", { name: "Enable automation", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: testInfo.outputPath("automation-flow-review.png"),
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Close flow editor", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Toggle color theme", exact: true })
    .click();
  await settleTheme(page, "dark");
  await page.getByRole("button", { name: "Open flow", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Review automation", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Exact saved posts", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("automation-flow-review-dark.png"),
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await dialog
    .getByRole("checkbox", { name: /I reviewed these exact posts/ })
    .check();
  await dialog
    .getByRole("button", { name: "Enable automation", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("Automation enabled");
  await page
    .getByRole("button", { name: "Close flow editor", exact: true })
    .click();
  await page.getByRole("button", { name: "Pause flow", exact: true }).click();
  await expect(page.locator(".flow-workspace .automation-list")).toContainText(
    "paused",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete flow", exact: true }).click();
  await expect(page.locator(".flow-workspace>header")).toContainText("0 saved");
  expect(state.commands).toEqual(["create", "enable", "pause", "delete"]);
});
test("changed resources reject enabling and clear the exact-review confirmation", async ({
  page,
}) => {
  const state = await fixture(page);
  await build(page);
  await page
    .getByRole("button", { name: "Review automation", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: /I reviewed these exact posts/ })
    .check();
  state.makeStale();
  await page
    .getByRole("button", { name: "Enable automation", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Template changed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enable automation", exact: true }),
  ).toHaveCount(0);
  expect(state.commands).toEqual(["create", "enable"]);
});

test("another tab's changed graph cannot be approved under the old displayed steps", async ({
  page,
}) => {
  const state = await fixture(page);
  await build(page);
  state.changeGraph();
  await page
    .getByRole("button", { name: "Review automation", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "changed in another tab" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enable automation", exact: true }),
  ).toHaveCount(0);
  expect(state.commands).toEqual(["create"]);
});
test("discard confirmation preserves unsaved edits and an account change clears the old editor", async ({
  page,
}) => {
  const state = await fixture(page);
  await build(page);
  await page
    .getByLabel("Automation name", { exact: true })
    .fill("Unsaved name");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Close flow editor", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Create automation", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Automation name", { exact: true })).toHaveValue(
    "Unsaved name",
  );
  state.switchOwner();
  await page.evaluate(() =>
    window.dispatchEvent(new Event("staysuite:groups-synced")),
  );
  await expect(
    page.getByRole("dialog", { name: "Create automation", exact: true }),
  ).not.toBeVisible();
  await expect(
    page.locator(".flow-workspace .automation-list"),
  ).not.toContainText("Fixture template flow");
  expect(state.commands).toEqual(["create"]);
});
test("extension handoff prefills only the matching StaySuite viewer's public identity", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto(
    `/dashboard/automations?scope=personal%3A12345&viewer=${owner}`,
  );
  await page
    .getByRole("button", { name: "Create automation flow", exact: true })
    .click();
  await page
    .getByText("Settings for new template posts", { exact: true })
    .click();
  await expect(
    page.getByLabel("Facebook identity ID", { exact: true }),
  ).toHaveValue("12345");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Close flow editor", exact: true })
    .click();
  await page.goto(
    `/dashboard/automations?scope=personal%3A12345&viewer=${groupId}`,
  );
  await expect(
    page.locator(".flow-workspace").getByRole("alert"),
  ).toContainText("Your account changed");
  await expect(
    page.getByRole("button", { name: "Create automation flow", exact: true }),
  ).toBeDisabled();
  expect(state.commands).toEqual([]);
});
