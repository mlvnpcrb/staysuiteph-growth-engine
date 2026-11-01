import { beforeEach, afterEach, expect, it, vi } from "vitest";
const prefix = "chrome-extension://fixture/",
  origin =
    "https://staysuiteph-growth-engine-test-mlvnpcrbs-projects.vercel.app",
  viewer = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222";
type Listener = (
  message: unknown,
  sender: { id: string; url?: string; frameId?: number },
  reply: (value: unknown) => void,
) => boolean;
let listener: Listener;
let alarm: (value: { name: string }) => void;
let values: Record<string, unknown>;
const create = vi.fn();
let actorId: string;
let tickIds: string[];
beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  values = {};
  actorId = "12345";
  tickIds = [];
  vi.stubGlobal("chrome", {
    runtime: {
      id: "fixture",
      getURL: (path: string) => prefix + path,
      onMessage: {
        addListener: (value: Listener) => {
          listener = value;
        },
      },
      onStartup: { addListener: () => {} },
    },
    alarms: {
      create: vi.fn(),
      clear: vi.fn(),
      onAlarm: {
        addListener: (callback: typeof alarm) => {
          alarm = callback;
        },
      },
    },
    storage: {
      local: {
        get: async (key: string) => ({ [key]: values[key] }),
        set: async (data: object) => Object.assign(values, data),
        remove: async (key: string) => {
          delete values[key];
        },
      },
    },
    permissions: { contains: async () => true },
    tabs: {
      get: async () => ({ id: 1, url: origin + "/dashboard/compose" }),
      query: async ({ url }: { url: string }) =>
        url.startsWith("https://www.facebook.com")
          ? [{ id: 2, status: "complete", url: "https://www.facebook.com/" }]
          : [],
      create,
    },
    scripting: {
      executeScript: async (input: { world: string; args?: unknown[] }) =>
        input.world === "MAIN"
          ? [{ result: { actor_id: actorId, actor_type: "personal" } }]
          : [
              {
                result: {
                  data: input.args?.[3]
                    ? { viewer_id: viewer, result: { campaign_ids: tickIds } }
                    : { viewer_id: viewer, schedules: [], runs: [] },
                },
              },
            ],
    },
  });
  await import("../../apps/extension/lib/schedule-background");
});
afterEach(() => vi.unstubAllGlobals());
const sender = {
  id: "fixture",
  url: prefix + "tabs/campaigns.html",
  frameId: 0,
};
const config = {
  tabId: 1,
  origin,
  viewer,
  actorId: "12345",
  generation: "33333333-3333-4333-8333-333333333333",
};
const message = (body: unknown) =>
  new Promise<unknown>((resolve) => listener(body, sender, resolve));
it("accepts arming only from the extension's top-level campaign workspace", async () => {
  for (const invalid of [
    { ...sender, id: "other" },
    { ...sender, frameId: 1 },
    { ...sender, url: origin + "/dashboard/compose" },
  ])
    expect(
      listener({ type: "SCHEDULE_ARM", connection: config }, invalid, () => {}),
    ).toBe(false);
  expect(values).toEqual({});
  expect(
    await message({
      type: "SCHEDULE_ARM",
      connection: { ...config, origin: "https://evil.example" },
    }),
  ).toMatchObject({ ok: false });
  expect(values).toEqual({});
});
it("rechecks identity on wakeup, opens only a server-selected job, and disarms on change", async () => {
  expect(await message({ type: "SCHEDULE_ARM", connection: config })).toEqual({
    ok: true,
  });
  tickIds = [id];
  alarm({ name: "staysuite-schedules-v1" });
  await vi.waitFor(() =>
    expect(create).toHaveBeenCalledExactlyOnceWith({
      url: `${prefix}tabs/campaigns.html?scheduled=${id}`,
      active: false,
    }),
  );
  actorId = "99999";
  create.mockClear();
  alarm({ name: "staysuite-schedules-v1" });
  await vi.waitFor(() =>
    expect(values["staysuite-schedule-connection-v1"]).toBeUndefined(),
  );
  expect(create).not.toHaveBeenCalled();
  expect(values["staysuite-schedule-status-v1"]).toMatchObject({
    status: "stopped",
  });
});
