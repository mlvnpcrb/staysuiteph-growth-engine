import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  campaignJobSchema,
  templateCommandSchema,
  postTemplateSchema,
  type PostTemplate,
  type CampaignJob,
} from "../../packages/validation/src/index";
const owner = "11111111-1111-4111-8111-111111111111",
  groupId = "22222222-2222-4222-8222-222222222222",
  targetId = "33333333-3333-4333-8333-333333333333";
async function fixture(page: Page, publisherReady = true) {
  let job: CampaignJob | null = null;
  const commands: string[] = [];
  let opened = 0,
    facebookRequests = 0;
  await page.route("https://www.facebook.com/**", (route) => {
    facebookRequests++;
    return route.abort();
  });
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
            title: "Owner-reviewed fixture group",
            destination: "",
            accommodation: "",
            audience: "",
            evidence: "",
            source: "manual",
            notes: "",
            review_status: "reviewed",
            rule_evidence: "Fixture permission",
            last_reviewed_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        stats: { total: 1, reviewed: 1, needsReview: 0 },
      },
    }),
  );
  await page.route("**/api/campaigns**", (route) => {
    const request = route.request();
    if (request.method() === "GET")
      return route.fulfill({
        json: new URL(request.url()).searchParams.has("id")
          ? { viewer_id: owner, job, assets: [] }
          : { viewer_id: owner, campaigns: job ? [job] : [] },
      });
    const body = request.postDataJSON();
    expect(request.headers()["x-staysuite-viewer"]).toBe(owner);
    commands.push(body.command);
    if (body.command === "create")
      job = campaignJobSchema.parse({
        id: body.id,
        user_id: owner,
        ...body.payload,
        actor_id: null,
        actor_type: "personal",
        state: "draft",
        revision: 1,
        approved_digest: null,
        digest: "a".repeat(64),
        next_eligible_at: new Date().toISOString(),
        stop_reason: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        media: [],
        targets: [
          {
            id: targetId,
            campaign_id: body.id,
            group_id: groupId,
            position: 0,
            state: "queued",
            attempt_token: null,
            lease_until: null,
            post_url: null,
            receipt_source: null,
          },
        ],
      });
    else if (body.command === "bind_actor") {
      expect(body.payload).toEqual({
        actor_id: "12345",
        actor_type: "personal",
      });
      job = { ...job!, ...body.payload, revision: 2, digest: "b".repeat(64) };
    } else
      throw new Error(
        "The web page must not bypass the native engine to publish.",
      );
    return route.fulfill({ json: { viewer_id: owner, job } });
  });
  await page.exposeFunction(
    "fixtureOpenPostingEngine",
    async (input: unknown) => {
      expect(input).toMatchObject({
        campaign_id: job?.id,
        revision: 2,
        digest: "b".repeat(64),
        viewer_id: owner,
        actor_id: "12345",
        actor_type: "personal",
        reviewed: true,
      });
      expect(job?.plan.text).toBe("  Exact composed post  ");
      opened++;
      if (publisherReady)
        job = {
          ...job!,
          state: "completed",
          revision: 4,
          approved_digest: "b".repeat(64),
          targets: job!.targets.map((target) => ({
            ...target,
            state: "pending_admin",
            post_url: "https://www.facebook.com/groups/12345/posts/67890/",
            receipt_source: "extension_report",
          })),
        };
      return {
        ok: true,
        request_id:
          input && typeof input === "object" && "request_id" in input
            ? input.request_id
            : null,
      };
    },
  );
  await page.addInitScript(
    ({ owner, publisherReady }) => {
      let statusRequests = 0;
      window.addEventListener("message", (event) => {
        if (event.source !== window || event.origin !== location.origin) return;
        const data = event.data;
        if (
          !data ||
          data.channel !== "staysuite-compose-engine-v1" ||
          data.direction !== "request"
        )
          return;
        const respond = (result: unknown) =>
          window.postMessage(
            {
              channel: data.channel,
              direction: "response",
              request_id: data.request_id,
              result,
            },
            location.origin,
          );
        if (data.operation === "status") {
          statusRequests++;
          const changed =
            localStorage.getItem("fixture-change-actor") === "true" &&
            statusRequests > 1;
          respond({
            ok: true,
            status: {
              viewer_id: owner,
              actor_id: changed ? "54321" : "12345",
              actor_type: "personal",
              publisher_ready: publisherReady,
              version: "0.5.4",
            },
          });
        } else if (data.operation === "open") {
          const invoke: unknown = Reflect.get(
            window,
            "fixtureOpenPostingEngine",
          );
          if (typeof invoke === "function")
            void Promise.resolve(invoke(data.input)).then(respond);
        }
      });
    },
    { owner, publisherReady },
  );
  return {
    commands,
    get opened() {
      return opened;
    },
    get facebookRequests() {
      return facebookRequests;
    },
  };
}
async function compose(page: Page) {
  await page.goto("/dashboard/compose");
  await expect(page.locator(".posting-as-chip")).toContainText(
    "Facebook identity 12345",
  );
  await page
    .getByLabel("Post text", { exact: true })
    .fill("  Exact composed post  ");
  await page
    .getByRole("button", { name: "Advanced selector", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: /Owner-reviewed fixture group/ })
    .check();
  await page
    .getByRole("button", { name: "Done selecting groups", exact: true })
    .click();
}
test("Post Now launches the engine with an exact saved version and reports backend receipts without Facebook redirection", async ({
  page,
}, testInfo) => {
  const state = await fixture(page);
  await compose(page);
  await page.getByRole("button", { name: "Post Now", exact: true }).click();
  await expect(page.locator(".compose-engine-message")).toContainText(
    "Posting started in the extension background",
  );
  await expect(page.locator(".compose-engine-progress")).toContainText(
    "1 of 1 submissions confirmed",
  );
  await expect(page.locator(".compose-engine-progress")).toContainText(
    "pending admin",
  );
  await expect(
    page.getByRole("link", { name: "View post", exact: true }),
  ).toHaveAttribute(
    "href",
    "https://www.facebook.com/groups/12345/posts/67890/",
  );
  await expect(page).toHaveURL(/\/dashboard\/compose$/);
  expect(state.commands).toEqual(["create", "bind_actor"]);
  expect(state.opened).toBe(1);
  expect(state.facebookRequests).toBe(0);
  await expect(
    page.getByRole("button", { name: "Write with AI", exact: true }),
  ).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("compose-posting-engine.png"),
    fullPage: true,
  });
});
test("an unverified profile stays in Compose without starting a queue or opening a tab", async ({
  page,
}) => {
  const state = await fixture(page, false);
  await compose(page);
  await page.getByRole("button", { name: "Post Now", exact: true }).click();
  await expect(page.locator(".compose-engine-message")).toContainText(
    "needs Direct publisher validation",
  );
  await expect(page.locator(".compose-engine-progress")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "View post", exact: true }),
  ).toHaveCount(0);
  expect(state.commands).toEqual([]);
  expect(state.opened).toBe(0);
});
test("a changed Facebook actor requires a new visible review before saving or launching", async ({
  page,
}) => {
  const state = await fixture(page);
  await compose(page);
  await page.evaluate(() =>
    localStorage.setItem("fixture-change-actor", "true"),
  );
  await page.getByRole("button", { name: "Post Now", exact: true }).click();
  await expect(page.locator(".compose-engine-message")).toContainText(
    "Facebook identity changed",
  );
  expect(state.commands).toEqual([]);
  expect(state.opened).toBe(0);
});

test("Compose saves exact text and verified private media as a template without launching the engine", async ({
  page,
}) => {
  const state = await fixture(page);
  const templateId = "77777777-7777-4777-8777-777777777777";
  let template: PostTemplate | null = null;
  const operations: string[] = [];
  let uploads = 0;
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1cAAAAASUVORK5CYII=",
    "base64",
  );
  await page.route("https://storage-fixture.test/**", (route) => {
    expect(route.request().method()).toBe("PUT");
    expect(route.request().headers()["x-upsert"]).toBe("false");
    expect(route.request().postDataBuffer()?.includes(png)).toBe(true);
    uploads++;
    return route.fulfill({ json: { Key: "fixture" } });
  });
  await page.route("**/api/templates", (route) => {
    expect(route.request().headers()["x-staysuite-viewer"]).toBe(owner);
    const command = templateCommandSchema.parse(route.request().postDataJSON());
    operations.push(command.operation);
    if (command.operation === "create") {
      expect(command.content.text).toBe("  Exact composed post  ");
      expect(command.content.assets).toHaveLength(1);
      template = postTemplateSchema.parse({
        id: templateId,
        user_id: owner,
        name: command.content.name,
        text: command.content.text,
        assets: command.content.assets.map((asset) => ({
          ...asset,
          object_path: `${owner}/${templateId}/${asset.id}`,
          uploaded: false,
        })),
        revision: 1,
        state: "draft",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } else if (command.operation === "upload")
      return route.fulfill({
        json: {
          viewer_id: owner,
          template,
          upload: {
            signedUrl: `https://storage-fixture.test/storage/v1/object/upload/sign/template-media/${owner}/${templateId}/${command.asset_id}?token=fixture`,
          },
        },
      });
    else if (command.operation === "finalize")
      template = {
        ...template!,
        state: "ready",
        revision: 2,
        assets: template!.assets.map((asset) => ({ ...asset, uploaded: true })),
      };
    else throw new Error("Unexpected template operation");
    return route.fulfill({ json: { viewer_id: owner, template } });
  });
  await compose(page);
  await page.getByLabel("Choose media or drop files here").setInputFiles({
    name: "template.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .getByLabel("Template name", { exact: true })
    .fill("Exact template");
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Save as template", exact: true }),
  ).not.toBeVisible();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Saved “Exact template” in Templates." }),
  ).toHaveCount(1);
  expect(operations).toEqual(["create", "upload", "finalize"]);
  expect(uploads).toBe(1);
  expect(state.opened).toBe(0);
  expect(state.commands).toEqual([]);
});
