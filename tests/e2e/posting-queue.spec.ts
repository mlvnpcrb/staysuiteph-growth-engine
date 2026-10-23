import { test, expect } from "@playwright/test";
const owner = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const targetId = "33333333-3333-4333-8333-333333333333";
test("saved queue reconciles an explicitly reviewed outcome without retrying", async ({
  page,
}) => {
  const writes: string[] = [];
  const job = {
    id,
    user_id: owner,
    actor_id: "12345",
    actor_type: "personal",
    state: "blocked",
    revision: 4,
    approved_digest: "a".repeat(64),
    digest: "a".repeat(64),
    stop_reason: "Submission needs review",
    next_eligible_at: "2026-10-23T01:00:00Z",
    created_at: "2026-10-23T01:00:00Z",
    updated_at: "2026-10-23T01:00:00Z",
    plan: {
      version: 1,
      text: "Fixture offer",
      groupIds: [targetId],
      intervalMinutes: 2,
      media: [],
    },
    settings: {
      method: "classic",
      pauseEvery: 1,
      pauseMinutes: 2,
      avoidNight: true,
      delayAfterFailure: true,
    },
    media: [],
    targets: [
      {
        id: targetId,
        campaign_id: id,
        group_id: targetId,
        position: 0,
        state: "uncertain",
        attempt_token: id,
        lease_until: null,
        post_url: null,
        receipt_source: "extension_report",
      },
    ],
  };
  await page.route("**/api/campaigns", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { viewer_id: owner, campaigns: [job] } });
    const body = route.request().postDataJSON();
    writes.push(body.command);
    expect(route.request().headers()["x-staysuite-viewer"]).toBe(owner);
    if (body.command === "resolve") {
      expect(body.payload).toEqual({
        target_id: targetId,
        reviewed: true,
        outcome: "not_sent",
      });
      job.targets[0]!.state = "not_sent";
      job.targets[0]!.receipt_source = "user_review";
      job.state = "completed";
      job.revision++;
    } else expect(body.command).toBe("inspect");
    return route.fulfill({ json: { viewer_id: owner, job } });
  });
  await page.goto("/dashboard/posting-queue");
  await page.getByRole("button", { name: "Open campaign details" }).click();
  await expect(
    page.getByRole("button", { name: /Resume posting/ }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Review outcome for group 1" })
    .click();
  const record = page.getByRole("button", { name: "Record reviewed outcome" });
  await expect(record).toBeDisabled();
  await page
    .getByRole("checkbox", { name: /I checked this submission/ })
    .check();
  await record.click();
  await expect(
    page.getByText("Recorded by you", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review outcome for group 1" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(/completed · Saved/)).toBeVisible();
  expect(writes).toEqual(["inspect", "resolve"]);
});
