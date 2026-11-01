import {
  campaignDashboard,
  campaignDashboardOrigin,
  campaignFacebookActor,
} from "./campaign-dashboard";
import {
  scheduledWakeup,
  scheduleConnectionSchema,
  SCHEDULE_CONNECTION,
  SCHEDULE_STATUS,
  type ScheduleConnection,
} from "./schedule-runtime";
const alarm = "staysuite-schedules-v1";
let checking = false;
async function stored() {
  return scheduleConnectionSchema.safeParse(
    (await chrome.storage.local.get(SCHEDULE_CONNECTION))[SCHEDULE_CONNECTION],
  );
}
async function stop() {
  await chrome.alarms.clear(alarm);
  await chrome.storage.local.remove(SCHEDULE_CONNECTION);
}
async function verify(connection: ScheduleConnection) {
  if (campaignDashboardOrigin(connection.origin) !== connection.origin)
    throw new Error("Invalid dashboard.");
  const tab = await chrome.tabs.get(connection.tabId);
  const url = new URL(tab.url || "");
  if (
    url.origin !== connection.origin ||
    !url.pathname.startsWith("/dashboard/")
  )
    throw new Error("Dashboard changed.");
  const host = new URL(connection.origin);
  if (
    !(await chrome.permissions.contains({
      permissions: ["tabs"],
      origins: [
        `${host.protocol}//${host.hostname}/*`,
        "https://www.facebook.com/*",
      ],
    }))
  )
    throw new Error("Reconnect to restore permission.");
}
async function actor() {
  const tab = (
    await chrome.tabs.query({ url: "https://www.facebook.com/*" })
  ).find((tab) => tab.id !== undefined && tab.status === "complete");
  if (tab?.id === undefined) throw new Error("Open Facebook first.");
  const result = (
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: campaignFacebookActor,
    })
  )[0]?.result;
  if (!result) throw new Error("Facebook identity could not be checked.");
  return result;
}
async function tick() {
  if (checking) return;
  checking = true;
  try {
    const value = await stored();
    if (!value.success) {
      await chrome.alarms.clear(alarm);
      return;
    }
    const connection = value.data;
    await verify(connection);
    const bridge = campaignDashboard(
      connection.tabId,
      connection.origin,
      connection.viewer,
    );
    const status = await scheduledWakeup(connection, {
      actor,
      tick: (identity) => bridge.scheduleTick(identity),
      stillArmed: async () => {
        const latest = await stored();
        return (
          latest.success && latest.data.generation === connection.generation
        );
      },
      open: async (id) => {
        const path = chrome.runtime.getURL("tabs/campaigns.html");
        const existing = (await chrome.tabs.query({ url: `${path}*` })).some(
          (tab) => {
            try {
              return (
                new URL(tab.url || "").searchParams.get("scheduled") === id
              );
            } catch {
              return false;
            }
          },
        );
        if (!existing)
          await chrome.tabs.create({
            url: `${path}?scheduled=${encodeURIComponent(id)}`,
            active: false,
          });
      },
    });
    await chrome.storage.local.set({
      [SCHEDULE_STATUS]: { at: new Date().toISOString(), status },
    });
  } catch {
    await stop();
    await chrome.storage.local.set({
      [SCHEDULE_STATUS]: {
        at: new Date().toISOString(),
        status: "stopped",
        message:
          "Reconnect StaySuite and Facebook, and review unfinished runs before rearming schedules.",
      },
    });
  } finally {
    checking = false;
  }
}
chrome.alarms.onAlarm.addListener((value) => {
  if (value.name === alarm) void tick();
});
chrome.runtime.onStartup.addListener(() => {
  void stored().then(async (value) => {
    if (value.success)
      await chrome.alarms.create(alarm, { periodInMinutes: 1 });
  });
});
chrome.runtime.onMessage.addListener((message: unknown, sender, reply) => {
  if (
    sender.id !== chrome.runtime.id ||
    (sender.frameId !== undefined && sender.frameId !== 0) ||
    sender.url?.split("?")[0] !== chrome.runtime.getURL("tabs/campaigns.html")
  )
    return false;
  if (
    !message ||
    typeof message !== "object" ||
    !("type" in message) ||
    !["SCHEDULE_ARM", "SCHEDULE_DISARM"].includes(String(message.type))
  )
    return false;
  void (async () => {
    if (message.type === "SCHEDULE_DISARM") {
      await stop();
      return;
    }
    if (!("connection" in message)) throw new Error("Reconnect first.");
    const connection = scheduleConnectionSchema.parse(message.connection);
    await verify(connection);
    const current = await actor();
    if (current.actor_id !== connection.actorId)
      throw new Error("Facebook identity changed.");
    await campaignDashboard(
      connection.tabId,
      connection.origin,
      connection.viewer,
    ).schedules();
    await chrome.storage.local.set({
      [SCHEDULE_CONNECTION]: connection,
      [SCHEDULE_STATUS]: { at: new Date().toISOString(), status: "armed" },
    });
    await chrome.alarms.create(alarm, {
      periodInMinutes: 1,
      delayInMinutes: 1,
    });
  })()
    .then(() => reply({ ok: true }))
    .catch(() =>
      reply({
        ok: false,
        error: "Reconnect StaySuite and Facebook before arming scheduled runs.",
      }),
    );
  return true;
});
