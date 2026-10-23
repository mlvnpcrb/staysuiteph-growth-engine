import { it, expect, vi } from "vitest";
import {
  executeCampaignTarget,
  type ExecutorPort,
} from "../../apps/extension/lib/campaign-executor";
import type { CampaignJob } from "@staysuite/validation";
const id = "11111111-1111-4111-8111-111111111111",
  token = "22222222-2222-4222-8222-222222222222";
const job: CampaignJob = {
  title: "",
  description: "",
  id,
  user_id: id,
  actor_id: "12345",
  actor_type: "personal",
  plan: {
    version: 1,
    text: "Fixture",
    intervalMinutes: 2,
    groupIds: [id],
    media: [],
  },
  settings: {
    method: "classic",
    pauseEvery: 1,
    pauseMinutes: 2,
    avoidNight: true,
    delayAfterFailure: true,
  },
  state: "running",
  revision: 3,
  approved_digest: "a".repeat(64),
  digest: "a".repeat(64),
  next_eligible_at: new Date().toISOString(),
  stop_reason: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  targets: [
    {
      id: token,
      campaign_id: id,
      group_id: id,
      position: 0,
      state: "claimed",
      attempt_token: token,
      lease_until: new Date(Date.now() + 90000).toISOString(),
      post_url: null,
      receipt_source: null,
    },
  ],
  media: [],
};
function port() {
  return {
    command: vi.fn<ExecutorPort["command"]>().mockResolvedValue(job),
    actor: vi
      .fn<ExecutorPort["actor"]>()
      .mockResolvedValue({ actor_id: "12345", actor_type: "personal" }),
    publish: vi.fn<ExecutorPort["publish"]>().mockResolvedValue({
      outcome: "live",
      code: "fixture",
      postUrl: "https://www.facebook.com/groups/987/posts/123/",
    }),
  };
}
it("never publishes when server claim fails", async () => {
  const p = port();
  p.command
    .mockResolvedValueOnce(job)
    .mockRejectedValueOnce(new Error("publisher disabled"));
  await expect(executeCampaignTarget(p, id)).rejects.toThrow(
    "publisher disabled",
  );
  expect(p.publish).not.toHaveBeenCalled();
});
it("never dispatches after pause or approval invalidation", async () => {
  for (const modified of [
    { ...job, state: "paused" as const },
    { ...job, digest: "b".repeat(64) },
    {
      ...job,
      targets: job.targets.map((t) => ({
        ...t,
        lease_until: new Date(Date.now() - 1).toISOString(),
      })),
    },
    {
      ...job,
      targets: job.targets.map((t) => ({ ...t, state: "uncertain" as const })),
    },
    { ...job, targets: job.targets.map((t) => ({ ...t, attempt_token: id })) },
  ]) {
    const p = port();
    p.command
      .mockResolvedValueOnce(job)
      .mockResolvedValueOnce(job)
      .mockResolvedValueOnce(modified);
    await executeCampaignTarget(p, id);
    expect(p.publish).not.toHaveBeenCalled();
    expect(p.command).toHaveBeenLastCalledWith(
      expect.objectContaining({
        command: "report",
        payload: { attempt_token: token, outcome: "stopped" },
      }),
    );
  }
});
it("records transport ambiguity once and does not retry publishing", async () => {
  const p = port();
  p.publish.mockRejectedValue(new Error("connection lost after click"));
  await executeCampaignTarget(p, id);
  expect(p.publish).toHaveBeenCalledTimes(1);
  expect(p.command).toHaveBeenLastCalledWith(
    expect.objectContaining({
      command: "report",
      payload: {
        attempt_token: token,
        outcome: "uncertain",
        provider_code: "interrupted",
      },
    }),
  );
});
it("requires actor continuity before dispatch", async () => {
  const p = port();
  p.actor
    .mockResolvedValueOnce({ actor_id: "12345", actor_type: "personal" })
    .mockResolvedValueOnce({ actor_id: "999", actor_type: "personal" });
  await executeCampaignTarget(p, id);
  expect(p.publish).not.toHaveBeenCalled();
});
