import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { campaignJobSchema } from "@staysuite/validation";
const m = vi.hoisted(() => ({
  user: vi.fn(),
  api: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  engine: vi.fn(),
  context: vi.fn(),
  start: vi.fn(),
  tick: vi.fn(),
  command: vi.fn(),
  publish: vi.fn(),
}));
vi.mock("../../apps/extension/lib/native-backend", () => ({
  nativeUser: m.user,
  nativeRequest: m.api,
  nativeSignIn: m.signIn,
  nativeSignOut: m.signOut,
  nativeCampaignBridge: () => ({ command: m.command }),
}));
vi.mock("../../apps/extension/lib/native-context", () => ({
  nativeEngineStatus: m.engine,
  nativeCampaignContext: m.context,
  nativeFacebook: vi.fn(),
}));
vi.mock("../../apps/extension/lib/compose-engine-runner", () => ({
  startComposeRun: m.start,
  tickComposeRun: m.tick,
  publishComposeTarget: m.publish,
  COMPOSE_RUN_ALARM: "staysuite-compose-run:",
}));
const owner = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222",
  group = "33333333-3333-4333-8333-333333333333",
  request_id = "44444444-4444-4444-8444-444444444444";
const input = {
  request_id,
  campaign_id: id,
  revision: 1,
  digest: "a".repeat(64),
  actor_id: "12345",
  actor_type: "personal",
  viewer_id: owner,
  reviewed: true,
};
let native: typeof import("../../apps/extension/lib/native-background");
const create = vi.fn();
beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  const job = campaignJobSchema.parse({
    id,
    user_id: owner,
    actor_id: "12345",
    actor_type: "personal",
    plan: {
      version: 1,
      text: "Exact fixture",
      groupIds: [group],
      intervalMinutes: 2,
      media: [],
    },
    settings: { method: "direct" },
    state: "draft",
    revision: 1,
    digest: input.digest,
    approved_digest: null,
    next_eligible_at: new Date().toISOString(),
    stop_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    media: [],
    targets: [
      {
        id: group,
        campaign_id: id,
        group_id: group,
        position: 0,
        state: "queued",
        attempt_token: null,
        lease_until: null,
        post_url: null,
        receipt_source: null,
      },
    ],
  });
  m.command.mockResolvedValue(job);
  m.tick.mockResolvedValue(undefined);
  m.engine.mockResolvedValue({
    connection: { mode: "native", viewer: owner },
    status: { publisher_ready: true },
  });
  m.context.mockResolvedValue({
    bridge: { command: m.command },
    actor: { actor_id: "12345", actor_type: "personal" },
  });
  m.user.mockResolvedValue({ id: owner, email: "fixture@example.test" });
  vi.stubGlobal("chrome", {
    runtime: {
      id: "fixture",
      getURL: (path: string) => "chrome-extension://fixture/" + path,
      onMessage: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
    },
    alarms: {
      onAlarm: { addListener: vi.fn() },
      create: vi.fn(),
      clear: vi.fn(),
    },
    tabs: { create },
    storage: {
      session: { get: async () => ({}), set: vi.fn(), remove: vi.fn() },
    },
  });
  native = await import("../../apps/extension/lib/native-background");
});
afterEach(() => vi.unstubAllGlobals());
it("accepts only top-frame messages from its own packaged UI", () => {
  expect(
    native.isNativeSender({
      id: "fixture",
      url: "chrome-extension://fixture/popup.html#/dashboard/compose",
      frameId: 0,
    }),
  ).toBe(true);
  for (const sender of [
    { id: "other", url: "chrome-extension://fixture/popup.html" },
    {
      id: "fixture",
      url: "https://staysuiteph-growth-engine.vercel.app/dashboard/compose",
    },
    { id: "fixture", url: "chrome-extension://fixture/popup.html", frameId: 1 },
    { id: "fixture", url: "chrome-extension://fixture/tabs/groups.html" },
  ])
    expect(native.isNativeSender(sender)).toBe(false);
});
it("forwards only schema-checked API requests with a pinned account", async () => {
  m.api.mockResolvedValue({
    status: 200,
    body: "{}",
    content_type: "application/json",
  });
  await native.handleNativeRequest({
    type: "NATIVE_API",
    path: "/api/groups",
    method: "GET",
    viewer: owner,
  });
  expect(m.api).toHaveBeenCalledWith("/api/groups", "GET", undefined, owner);
  await expect(
    native.handleNativeRequest({
      type: "NATIVE_API",
      path: "/api/groups",
      method: "GET",
      viewer: owner,
      token: "forged",
    }),
  ).rejects.toThrow();
});
it("starts a native background run without creating a dashboard or engine tab", async () => {
  const result = await native.handleNativeRequest({
    type: "NATIVE_ENGINE_OPEN",
    input,
  });
  expect(result).toEqual({ request_id });
  expect(m.start).toHaveBeenCalledOnce();
  expect(m.tick).toHaveBeenCalledOnce();
  expect(create).not.toHaveBeenCalled();
});
it("returns a first-use validation review instead of dispatching an unvalidated profile", async () => {
  m.engine.mockResolvedValue({
    connection: { mode: "native", viewer: owner },
    status: { publisher_ready: false },
  });
  const result = await native.handleNativeRequest({
    type: "NATIVE_ENGINE_OPEN",
    input,
  });
  expect(result).toMatchObject({ validation_required: true, input });
  expect(m.start).not.toHaveBeenCalled();
  expect(m.tick).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
});
it("rejects changed content and unauthorized validation intent before dispatch", async () => {
  await expect(
    native.handleNativeRequest({
      type: "NATIVE_ENGINE_OPEN",
      input: { ...input, digest: "b".repeat(64) },
    }),
  ).rejects.toThrow("saved post changed");
  await expect(
    native.handleNativeRequest({
      type: "NATIVE_VALIDATE_ONE",
      input: { ...input, reviewed: false },
    }),
  ).rejects.toThrow();
  expect(m.start).not.toHaveBeenCalled();
});

it("approves the exact first-use trial before requesting its single server claim", async () => {
  let job = campaignJobSchema.parse(await m.command());
  m.command.mockImplementation(async (value) => {
    if (value.command === "approve")
      job = {
        ...job,
        state: "ready",
        revision: 2,
        approved_digest: input.digest,
      };
    if (value.command === "validate_one") {
      expect(value.revision).toBe(2);
      job = {
        ...job,
        state: "running",
        revision: 3,
        targets: job.targets.map((target) => ({
          ...target,
          state: "claimed",
          attempt_token: request_id,
          lease_until: new Date(Date.now() + 180000).toISOString(),
        })),
      };
    }
    if (value.command === "report")
      job = {
        ...job,
        state: "paused",
        targets: job.targets.map((target) => ({
          ...target,
          state: "live",
          post_url: "https://www.facebook.com/groups/12345/posts/67890/",
        })),
      };
    return job;
  });
  m.publish.mockResolvedValue({
    outcome: "live",
    code: "direct_story_receipt",
    postUrl: "https://www.facebook.com/groups/12345/posts/67890/",
  });
  m.engine.mockResolvedValue({
    connection: { mode: "native", viewer: owner },
    status: { publisher_ready: false },
  });
  const result = await native.handleNativeRequest({
    type: "NATIVE_VALIDATE_ONE",
    input,
  });
  expect(result).toMatchObject({ job: { state: "paused" } });
  expect(
    m.command.mock.calls.map(([value]) => value?.command).filter(Boolean),
  ).toEqual(["inspect", "approve", "validate_one", "inspect", "report"]);
  expect(m.publish).toHaveBeenCalledOnce();
  expect(m.publish.mock.calls[0]?.[4]).toBe(true);
  expect(m.start).not.toHaveBeenCalled();
});
