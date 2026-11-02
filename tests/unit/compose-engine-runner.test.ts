import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  campaignJobSchema,
  COMPOSE_ENGINE_RUN,
  type CampaignJob,
  type CampaignCommand,
  type ComposeEngineConnection,
  type ComposeEngineOpen,
} from "@staysuite/validation";
import {
  startComposeRun,
  tickComposeRun,
  COMPOSE_RUN_ALARM,
} from "../../apps/extension/lib/compose-engine-runner";
const owner = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const request = "33333333-3333-4333-8333-333333333333";
const generation = "44444444-4444-4444-8444-444444444444";
const groupIds = Array.from(
  { length: 5 },
  (_, index) => `55555555-5555-4555-8555-55555555555${index}`,
);
const actor = { actor_id: "12345", actor_type: "personal" as const };
const connection: ComposeEngineConnection = {
  tabId: 1,
  origin: "http://localhost:3000",
  viewer: owner,
  actorId: actor.actor_id,
  generation,
  connected_at: Date.now(),
};
const input: ComposeEngineOpen = {
  request_id: request,
  campaign_id: id,
  revision: 1,
  digest: "a".repeat(64),
  ...actor,
  viewer_id: owner,
  reviewed: true,
};
let job: CampaignJob, values: Record<string, unknown>;
const command = vi.fn(),
  read = vi.fn(),
  restore = vi.fn(),
  script = vi.fn(),
  createAlarm = vi.fn(),
  clearAlarm = vi.fn();
const createTab = vi.fn(),
  updateTab = vi.fn();
const verify = vi.fn(async () => ({
  bridge: {
    command,
    read,
    restore,
    list: vi.fn(),
    schedules: vi.fn(),
    scheduleTick: vi.fn(),
  },
  actor,
  actorTabId: 7,
}));
const stored = () => values[COMPOSE_ENGINE_RUN + request];
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-02T04:00:00Z"));
  vi.clearAllMocks();
  values = {};
  verify.mockImplementation(async () => ({
    bridge: {
      command,
      read,
      restore,
      list: vi.fn(),
      schedules: vi.fn(),
      scheduleTick: vi.fn(),
    },
    actor,
    actorTabId: 7,
  }));
  job = campaignJobSchema.parse({
    id,
    user_id: owner,
    title: "Five-group fixture",
    description: "",
    ...actor,
    plan: {
      version: 1,
      text: "Exact approved message",
      groupIds,
      intervalMinutes: 2,
      media: [],
    },
    settings: { method: "direct", avoidNight: false },
    state: "draft",
    revision: 1,
    digest: input.digest,
    approved_digest: null,
    next_eligible_at: new Date().toISOString(),
    stop_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    media: [],
    targets: groupIds.map((group, position) => ({
      id: group,
      campaign_id: id,
      group_id: group,
      position,
      state: "queued",
      attempt_token: null,
      lease_until: null,
      post_url: null,
      receipt_source: null,
    })),
  });
  command.mockImplementation(async (value: CampaignCommand) => {
    if (value.command === "approve")
      job = {
        ...job,
        state: "ready",
        approved_digest: input.digest,
        revision: job.revision + 1,
      };
    if (value.command === "start")
      job = { ...job, state: "running", revision: job.revision + 1 };
    if (value.command === "pause")
      job = { ...job, state: "paused", revision: job.revision + 1 };
    if (value.command === "claim") {
      expect(Date.parse(job.next_eligible_at)).toBeLessThanOrEqual(Date.now());
      expect(job.targets.some((target) => target.state === "claimed")).toBe(
        false,
      );
      const next = job.targets.find((target) => target.state === "queued")!;
      job = {
        ...job,
        targets: job.targets.map((target) =>
          target.id === next.id
            ? {
                ...target,
                state: "claimed",
                attempt_token: crypto.randomUUID(),
                lease_until: new Date(Date.now() + 180000).toISOString(),
              }
            : target,
        ),
      };
    }
    if (value.command === "report") {
      const targets = job.targets.map((target) =>
        target.attempt_token === value.payload.attempt_token
          ? {
              ...target,
              state: value.payload.outcome as "live" | "uncertain",
              post_url:
                typeof value.payload.post_url === "string"
                  ? value.payload.post_url
                  : null,
            }
          : target,
      );
      job = {
        ...job,
        targets,
        state:
          value.payload.outcome !== "live"
            ? "paused"
            : targets.every((target) => target.state === "live")
              ? "completed"
              : "running",
        next_eligible_at: new Date(Date.now() + 120000).toISOString(),
      };
    }
    return structuredClone(job);
  });
  restore.mockImplementation(async () => ({
    viewer_id: owner,
    job: structuredClone(job),
    assets: [],
  }));
  read.mockImplementation(async (path: string) =>
    path === "/api/groups"
      ? {
          viewer_id: owner,
          groups: groupIds.map((group, i) => ({
            id: group,
            user_id: owner,
            identity: actor.actor_id,
            url: `https://www.facebook.com/groups/${10000 + i}/`,
            title: `Fixture ${i}`,
            destination: "",
            accommodation: "",
            audience: "",
            evidence: "",
            source: "manual",
            notes: "",
            review_status: "reviewed",
            rule_evidence: "Owner checked fixture",
            last_reviewed_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })),
          stats: { total: 5, reviewed: 5, needsReview: 0 },
        }
      : { viewer_id: owner, direct: true },
  );
  script.mockImplementation(
    async ({ args }: { args: [{ groupUrl: string }] }) => [
      {
        result: {
          outcome: "live",
          code: "direct_story_receipt",
          postUrl: `${args[0].groupUrl}posts/67890/`,
        },
      },
    ],
  );
  vi.stubGlobal("chrome", {
    storage: {
      session: {
        get: async (key: string | null) =>
          key === null ? { ...values } : { [key]: values[key] },
        set: async (next: Record<string, unknown>) =>
          Object.assign(values, next),
      },
    },
    alarms: { create: createAlarm, clear: clearAlarm },
    scripting: { executeScript: script },
    tabs: { create: createTab, update: updateTab },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("posts the exact message to five groups sequentially with server intervals and no tab navigation", async () => {
  await startComposeRun(input, connection, verify);
  expect(script).not.toHaveBeenCalled();
  for (let i = 0; i < 5; i++) {
    await tickComposeRun(request, verify);
    expect(script).toHaveBeenCalledTimes(i + 1);
    expect(script.mock.calls[i]![0]).toMatchObject({
      target: { tabId: 7 },
      world: "MAIN",
      args: [
        {
          text: job.plan.text,
          groupUrl: `https://www.facebook.com/groups/${10000 + i}/`,
          approvalDigest: input.digest,
          allowSubmit: true,
        },
      ],
    });
    if (i < 4) {
      await tickComposeRun(request, verify);
      expect(script).toHaveBeenCalledTimes(i + 1);
      expect(createAlarm).toHaveBeenLastCalledWith(
        COMPOSE_RUN_ALARM + request,
        { when: Date.parse(job.next_eligible_at), periodInMinutes: 1 },
      );
      vi.setSystemTime(Date.now() + 120000);
    }
  }
  expect(job.state).toBe("completed");
  expect(stored()).toMatchObject({ state: "done" });
  expect(createTab).not.toHaveBeenCalled();
  expect(updateTab).not.toHaveBeenCalled();
});
it("deduplicates retries and rejects another simultaneous queue", async () => {
  await startComposeRun(input, connection, verify);
  await startComposeRun(input, connection, verify);
  expect(
    command.mock.calls.filter(([value]) => value.command === "approve"),
  ).toHaveLength(1);
  await expect(
    startComposeRun({ ...input, request_id: generation }, connection, verify),
  ).rejects.toThrow("already active");
  await expect(
    startComposeRun({ ...input, digest: "b".repeat(64) }, connection, verify),
  ).rejects.toThrow("request changed");
});
it("does not approve or create a tab when publisher validation is absent", async () => {
  read.mockResolvedValue({ viewer_id: owner, direct: false });
  await expect(startComposeRun(input, connection, verify)).rejects.toThrow(
    "validation",
  );
  expect(command).not.toHaveBeenCalled();
  expect(createTab).not.toHaveBeenCalled();
});
it("pauses a recovered in-flight claim instead of risking a duplicate post", async () => {
  await startComposeRun(input, connection, verify);
  job.targets[0] = {
    ...job.targets[0]!,
    state: "claimed",
    attempt_token: generation,
    lease_until: new Date(Date.now() + 1000).toISOString(),
  };
  await tickComposeRun(request, verify);
  expect(job.state).toBe("paused");
  expect(script).not.toHaveBeenCalled();
  expect(stored()).toMatchObject({
    state: "stopped",
    error: expect.stringContaining("interrupted"),
  });
});
it("stops if the account connection changes between wakeups", async () => {
  await startComposeRun(input, connection, verify);
  verify.mockRejectedValue(new Error("Account changed"));
  await tickComposeRun(request, verify);
  expect(script).not.toHaveBeenCalled();
  expect(stored()).toMatchObject({
    state: "stopped",
    error: "Account changed",
  });
});
it("reports uncertain submission and does not automatically retry it", async () => {
  await startComposeRun(input, connection, verify);
  script.mockRejectedValue(new Error("Response lost"));
  await tickComposeRun(request, verify);
  await tickComposeRun(request, verify);
  expect(script).toHaveBeenCalledTimes(1);
  expect(job.targets[0]?.state).toBe("uncertain");
  expect(stored()).toMatchObject({ state: "stopped" });
});
it("respects dashboard pause and never dispatches a later group", async () => {
  await startComposeRun(input, connection, verify);
  await tickComposeRun(request, verify);
  job = { ...job, state: "paused" };
  vi.setSystemTime(Date.now() + 120000);
  await tickComposeRun(request, verify);
  expect(script).toHaveBeenCalledTimes(1);
  expect(stored()).toMatchObject({ state: "stopped" });
});
