import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  campaignJobSchema,
  COMPOSE_ENGINE_CONNECTION,
  type CampaignJob,
} from "@staysuite/validation";
const m = vi.hoisted(() => ({
  list: vi.fn(),
  command: vi.fn(),
  read: vi.fn(),
  origin: vi.fn(),
  start: vi.fn(),
  tick: vi.fn(),
}));
vi.mock("../../apps/extension/lib/campaign-dashboard", () => ({
  campaignDashboard: () => ({ list: m.list, command: m.command, read: m.read }),
  campaignDashboardOrigin: m.origin,
  campaignFacebookActor: () => null,
}));
vi.mock("../../apps/extension/lib/compose-engine-runner", () => ({
  startComposeRun: m.start,
  tickComposeRun: m.tick,
  COMPOSE_RUN_ALARM: "staysuite-compose-run:",
}));
const owner = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222",
  requestId = "33333333-3333-4333-8333-333333333333",
  generation = "44444444-4444-4444-8444-444444444444",
  group = "55555555-5555-4555-8555-555555555555",
  origin = "http://localhost:3000",
  page = "chrome-extension://fixture/tabs/campaigns.html";
const connection = {
  tabId: 1,
  origin,
  viewer: owner,
  actorId: "12345",
  generation,
};
const input = () => ({
  request_id: requestId,
  campaign_id: id,
  revision: 1,
  digest: "a".repeat(64),
  actor_id: "12345",
  actor_type: "personal",
  viewer_id: owner,
  reviewed: true,
});
let listener: (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  reply: (value: unknown) => void,
) => boolean;
let values: Record<string, unknown>, job: CampaignJob;
const script = vi.fn(),
  create = vi.fn(),
  update = vi.fn(),
  permission = vi.fn();
const internal = {
  id: "fixture",
  url: page,
  frameId: 0,
  tab: {
    id: 3,
    index: 0,
    pinned: false,
    highlighted: false,
    windowId: 1,
    active: true,
    incognito: false,
    selected: true,
    discarded: false,
    autoDiscardable: true,
    groupId: -1,
  },
};
const dashboard = {
  ...internal,
  url: `${origin}/dashboard/compose`,
  tab: { ...internal.tab, id: 1 },
};
async function send(
  message: unknown,
  sender: chrome.runtime.MessageSender = dashboard,
) {
  return await new Promise<unknown>((resolve) => {
    expect(listener(message, sender, resolve)).toBe(true);
  });
}
async function connect() {
  expect(
    await send({ type: "COMPOSE_ENGINE_CONNECT", connection }, internal),
  ).toEqual({ ok: true });
}
async function open(changes: Record<string, unknown> = {}) {
  return send({
    type: "COMPOSE_ENGINE_OPEN",
    generation,
    input: { ...input(), ...changes },
  });
}
beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  values = {};
  job = campaignJobSchema.parse({
    id,
    user_id: owner,
    title: "Fixture",
    description: "",
    actor_id: "12345",
    actor_type: "personal",
    plan: {
      version: 1,
      text: "  Exact post  ",
      groupIds: [group],
      intervalMinutes: 1,
      media: [],
    },
    settings: { method: "direct" },
    state: "draft",
    revision: 1,
    digest: "a".repeat(64),
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
  m.tick.mockResolvedValue(undefined);
  m.origin.mockImplementation((value) => value);
  m.list.mockResolvedValue({ viewer_id: owner, campaigns: [] });
  m.command.mockImplementation(async () => job);
  m.start.mockImplementation(async (value) => {
    const { assertComposeEnginePost } = await import(
      "../../apps/extension/lib/compose-engine-domain"
    );
    assertComposeEnginePost(
      value,
      job,
      { actor_id: "12345", actor_type: "personal" },
      owner,
    );
  });
  m.read.mockResolvedValue({ viewer_id: owner, direct: true });
  script.mockResolvedValue([
    { result: { actor_id: "12345", actor_type: "personal" } },
  ]);
  permission.mockResolvedValue(true);
  create.mockResolvedValue({ id: 9 });
  update.mockResolvedValue({ id: 9 });
  vi.stubGlobal("chrome", {
    runtime: {
      id: "fixture",
      getURL: (path: string) => `chrome-extension://fixture/${path}`,
      getManifest: () => ({ version: "0.5.4" }),
      onMessage: {
        addListener: (value: typeof listener) => {
          listener = value;
        },
      },
    },
    alarms: { onAlarm: { addListener: vi.fn() } },
    permissions: { contains: permission },
    tabs: {
      get: async (tabId: number) =>
        tabId === 9
          ? { id: 9, url: `${page}?engine=${requestId}` }
          : { id: 1, url: `${origin}/dashboard/compose` },
      query: async () => [{ id: 2, status: "complete" }],
      create,
      update,
      onUpdated: { addListener: vi.fn() },
    },
    scripting: { executeScript: script },
    storage: {
      session: {
        get: async (key: string | null) =>
          key === null ? { ...values } : { [key]: values[key] },
        set: async (next: Record<string, unknown>) =>
          Object.assign(values, next),
        remove: async (keys: string[]) => {
          for (const key of keys) delete values[key];
        },
      },
    },
  });
  await import("../../apps/extension/lib/compose-engine-background");
});
afterEach(() => vi.unstubAllGlobals());
it("registers only an extension workspace and installs a scoped isolated bridge", async () => {
  expect(
    await send({ type: "COMPOSE_ENGINE_CONNECT", connection }, dashboard),
  ).toMatchObject({ ok: false });
  expect(values).toEqual({});
  await connect();
  expect(values[COMPOSE_ENGINE_CONNECTION]).toMatchObject(connection);
  expect(script).toHaveBeenLastCalledWith(
    expect.objectContaining({
      world: "ISOLATED",
      target: { tabId: 1 },
      args: [origin, generation],
    }),
  );
});
it("rejects missing permission, wrong viewers and changed actors before connecting", async () => {
  permission.mockResolvedValue(false);
  expect(
    await send({ type: "COMPOSE_ENGINE_CONNECT", connection }, internal),
  ).toMatchObject({ ok: false });
  permission.mockResolvedValue(true);
  m.list.mockResolvedValue({ viewer_id: id, campaigns: [] });
  expect(
    await send({ type: "COMPOSE_ENGINE_CONNECT", connection }, internal),
  ).toMatchObject({ ok: false });
  m.list.mockResolvedValue({ viewer_id: owner, campaigns: [] });
  script.mockResolvedValue([
    { result: { actor_id: "54321", actor_type: "personal" } },
  ]);
  expect(
    await send({ type: "COMPOSE_ENGINE_CONNECT", connection }, internal),
  ).toMatchObject({ ok: false });
  expect(create).not.toHaveBeenCalled();
});
it("returns minimal fresh owner/actor publisher status without credentials", async () => {
  await connect();
  const status = await send({ type: "COMPOSE_ENGINE_STATUS", generation });
  expect(status).toEqual({
    ok: true,
    status: {
      viewer_id: owner,
      actor_id: "12345",
      actor_type: "personal",
      publisher_ready: true,
      version: "0.5.4",
    },
  });
});
it("rejects other extensions, frames, tabs, origins and stale generations", async () => {
  await connect();
  for (const sender of [
    { ...dashboard, id: "other" },
    { ...dashboard, frameId: 1 },
    { ...dashboard, tab: { ...dashboard.tab, id: 8 } },
    { ...dashboard, url: "https://other.example/dashboard/compose" },
  ])
    expect(
      await send(
        { type: "COMPOSE_ENGINE_OPEN", generation, input: input() },
        sender,
      ),
    ).toMatchObject({ ok: false });
  expect(
    await send({ type: "COMPOSE_ENGINE_OPEN", generation: id, input: input() }),
  ).toMatchObject({ ok: false });
  expect(create).not.toHaveBeenCalled();
});
it("dispatches to the background runner without opening or focusing any tab", async () => {
  await connect();
  expect(await open()).toEqual({ ok: true, request_id: requestId });
  expect(m.start).toHaveBeenCalledWith(
    input(),
    expect.objectContaining(connection),
    expect.any(Function),
  );
  expect(create).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
});
it.each([
  { revision: 2 },
  { digest: "b".repeat(64) },
  { actor_id: "54321" },
  { viewer_id: id },
  { reviewed: false },
  { unknown: true },
])("refuses changed or forged Compose review %j", async (change) => {
  await connect();
  expect(await open(change)).toMatchObject({ ok: false });
  expect(create).not.toHaveBeenCalled();
});
it("does not open unsupported or previously dispatched content", async () => {
  await connect();
  job = { ...job, settings: { ...job.settings, method: "classic" } };
  expect(await open()).toMatchObject({ ok: false });
  job = {
    ...job,
    settings: { ...job.settings, method: "direct" },
    state: "running",
  };
  expect(await open()).toMatchObject({ ok: false });
  expect(create).not.toHaveBeenCalled();
});
it("rejects legacy visible-window launch claims", async () => {
  await connect();
  expect(
    await send(
      { type: "COMPOSE_ENGINE_TAKE", request_id: requestId, engine_tab_id: 9 },
      internal,
    ),
  ).toMatchObject({ ok: false });
  expect(create).not.toHaveBeenCalled();
});
