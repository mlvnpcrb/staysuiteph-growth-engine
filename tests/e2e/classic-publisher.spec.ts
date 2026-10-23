import { test, expect } from "@playwright/test";
import {
  classicPublisherPage,
  type ClassicPublishInput,
} from "../../apps/extension/lib/classic-publisher";
const input: ClassicPublishInput = {
  actorId: "12345",
  groupUrl: "https://www.facebook.com/groups/98765/",
  text: "Fixture accommodation offer",
  attemptToken: "11111111-1111-4111-8111-111111111111",
  approvalDigest: "a".repeat(64),
  allowSubmit: true,
  expiresAt: Date.now() + 300000,
  media: [],
};
async function fixture(
  page: import("@playwright/test").Page,
  mode:
    | "live"
    | "pending"
    | "warning"
    | "actor"
    | "existing"
    | "receiptOnly" = "live",
) {
  await page.route("**/*", (route) =>
    route.request().url() === input.groupUrl
      ? route.fulfill({
          contentType: "text/html",
          body: `<!doctype html><html><body><div role="dialog"><div role="textbox" contenteditable="true" aria-label="Post text">${mode === "existing" ? "An existing draft" : ""}</div><button id="publish">Post</button></div>${mode === "warning" ? '<div role="alert">Your account is temporarily blocked</div>' : ""}<script>window.postClicks=0;window.require=function(name){return name==='CurrentUser'?{getID:()=>'${mode === "actor" ? "999" : "12345"}'}:{USER_ID:'12345',PROFILE_ID:'12345'}};document.getElementById('publish').onclick=()=>{window.postClicks++;const status=document.createElement('div');status.setAttribute('role','status');status.innerHTML='${mode === "pending" ? "Your post is pending approval" : mode === "receiptOnly" ? "Related post" : "Your post was published"}. <a href="https://www.facebook.com/groups/98765/posts/54321/">View post</a>';document.body.append(status)};</script></body></html>`,
        })
      : route.abort(),
  );
  await page.goto(input.groupUrl);
}
test("isolated classic adapter binds actor and exact content and distinguishes receipts", async ({
  page,
}) => {
  await fixture(page);
  const result = await page.evaluate(classicPublisherPage, input);
  expect(result).toMatchObject({
    outcome: "live",
    postUrl: "https://www.facebook.com/groups/98765/posts/54321/",
  });
  expect(await page.locator('[role="textbox"]').innerText()).toBe(input.text);
});
test("isolated classic adapter separates admin moderation from live posts", async ({
  page,
}) => {
  await fixture(page, "pending");
  expect(await page.evaluate(classicPublisherPage, input)).toMatchObject({
    outcome: "pending_admin",
  });
});
test("classic readiness check does not type, attach or submit", async ({
  page,
}) => {
  await fixture(page);
  expect(
    await page.evaluate(classicPublisherPage, { ...input, allowSubmit: false }),
  ).toMatchObject({ outcome: "ready" });
  expect(await page.locator('[role="textbox"]').innerText()).toBe("");
  expect(await page.evaluate(() => Reflect.get(window, "postClicks"))).toBe(0);
});
test("classic adapter stops on warnings, actor changes and preexisting drafts", async ({
  page,
}) => {
  for (const mode of ["warning", "actor", "existing"] as const) {
    await fixture(page, mode);
    const result = await page.evaluate(classicPublisherPage, input);
    expect(["not_sent", "stopped"]).toContain(result.outcome);
    expect(await page.evaluate(() => Reflect.get(window, "postClicks"))).toBe(
      0,
    );
    await page.unroute("**/*");
  }
});
test("a new post link alone is not publication proof", async ({ page }) => {
  await fixture(page, "receiptOnly");
  expect(await page.evaluate(classicPublisherPage, input)).toMatchObject({
    outcome: "uncertain",
    code: "post_url_without_confirmation",
  });
});

test("expired publication claims never type or click Post", async ({
  page,
}) => {
  await fixture(page);
  expect(
    await page.evaluate(classicPublisherPage, {
      ...input,
      expiresAt: Date.now() - 1,
    }),
  ).toMatchObject({ outcome: "not_sent", code: "claim_expired" });
  expect(await page.locator('[role="textbox"]').innerText()).toBe("");
  expect(await page.evaluate(() => Reflect.get(window, "postClicks"))).toBe(0);
});

test("blocking dialogs and overlays cannot be bypassed by programmatic submission", async ({
  page,
}) => {
  for (const mode of ["alertdialog", "overlay"]) {
    await fixture(page);
    await page.evaluate((mode) => {
      const blocker = document.createElement("div");
      blocker.textContent = "Account check";
      if (mode === "alertdialog") blocker.setAttribute("role", "alertdialog");
      blocker.style.cssText =
        "position:fixed;inset:0;z-index:9999;background:white";
      document.body.append(blocker);
    }, mode);
    const result = await page.evaluate(classicPublisherPage, input);
    expect(result.outcome).toBe("stopped");
    expect(await page.evaluate(() => Reflect.get(window, "postClicks"))).toBe(
      0,
    );
  }
});
