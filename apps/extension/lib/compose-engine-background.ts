import {
  COMPOSE_ENGINE_CONNECTION,
  composeEngineConnectionSchema,
  composeEngineRequestSchema,
  type ComposeEngineConnection,
} from "@staysuite/validation";
import {
  campaignDashboard,
  campaignDashboardOrigin,
  campaignFacebookActor,
} from "./campaign-dashboard";
import {
  installComposeEngineBridge,
  composeEngineActorName,
} from "./compose-engine-page";
import {
  startComposeRun,
  tickComposeRun,
  COMPOSE_RUN_ALARM,
} from "./compose-engine-runner";
let operations: Promise<unknown> = Promise.resolve();
const enginePage = () => chrome.runtime.getURL("tabs/campaigns.html");
async function current(connection: ComposeEngineConnection) {
  if (
    Date.now() - connection.connected_at > 8 * 3600000 ||
    campaignDashboardOrigin(connection.origin) !== connection.origin
  )
    throw new Error("Reconnect the posting engine.");
  const tab = await chrome.tabs.get(connection.tabId);
  const url = new URL(tab.url ?? "");
  if (
    url.origin !== connection.origin ||
    !url.pathname.startsWith("/dashboard/")
  )
    throw new Error("The connected StaySuite tab changed.");
  const host = new URL(connection.origin);
  if (
    !(await chrome.permissions.contains({
      origins: [
        `${host.protocol}//${host.hostname}/*`,
        "https://www.facebook.com/*",
      ],
    }))
  )
    throw new Error("Reconnect to restore posting-engine permission.");
  const bridge = campaignDashboard(
    connection.tabId,
    connection.origin,
    connection.viewer,
  );
  const list = await bridge.list();
  if (list.viewer_id !== connection.viewer)
    throw new Error("StaySuite account changed. Reconnect the posting engine.");
  let actor: { actor_id: string; actor_type: "personal" } | null = null;
  let actorTabId: number | null = null;
  for (const candidate of (
    await chrome.tabs.query({ url: "https://www.facebook.com/*" })
  ).slice(0, 5)) {
    if (candidate.id === undefined || candidate.status !== "complete") continue;
    const fresh = (
      await chrome.scripting.executeScript({
        target: { tabId: candidate.id },
        world: "MAIN",
        func: campaignFacebookActor,
      })
    )[0]?.result;
    if (fresh) {
      if (actor && actor.actor_id !== fresh.actor_id)
        throw new Error(
          "Facebook tabs disagree about your identity. Reconnect.",
        );
      actor = fresh;
      actorTabId = candidate.id;
    }
  }
  if (!actor || actor.actor_id !== connection.actorId)
    throw new Error("Facebook identity changed. Reconnect the posting engine.");
  return { bridge, actor, actorTabId };
}
async function savedConnection() {
  const parsed = composeEngineConnectionSchema.safeParse(
    (await chrome.storage.session.get(COMPOSE_ENGINE_CONNECTION))[
      COMPOSE_ENGINE_CONNECTION
    ],
  );
  if (!parsed.success)
    throw new Error("Connect StaySuite and Facebook in the extension first.");
  return parsed.data;
}
async function install(connection: ComposeEngineConnection) {
  await chrome.scripting.executeScript({
    target: { tabId: connection.tabId },
    world: "ISOLATED",
    func: installComposeEngineBridge,
    args: [connection.origin, connection.generation],
  });
}
async function handle(raw: unknown, sender: chrome.runtime.MessageSender) {
  const request = composeEngineRequestSchema.parse(raw);
  const internal =
    sender.id === chrome.runtime.id &&
    (sender.frameId === undefined || sender.frameId === 0);
  if (!internal) throw new Error("Posting-engine sender was not accepted.");
  if (request.type === "COMPOSE_ENGINE_CONNECT") {
    if (sender.url?.split("?")[0] !== enginePage())
      throw new Error("Connect from the extension workspace.");
    const connection = { ...request.connection, connected_at: Date.now() };
    await current(connection);
    await chrome.storage.session.set({
      [COMPOSE_ENGINE_CONNECTION]: connection,
    });
    await install(connection);
    return { ok: true };
  }
  if (request.type === "COMPOSE_ENGINE_TAKE") {
    throw new Error(
      "Compose now runs in the extension background. Return to Compose to start a reviewed post.",
    );
  }
  const connection = await savedConnection();
  if (
    sender.tab?.id !== connection.tabId ||
    sender.url?.split("?")[0]?.split("#")[0] === enginePage() ||
    request.generation !== connection.generation
  )
    throw new Error("This tab is not connected to the posting engine.");
  const url = new URL(sender.url ?? "");
  if (
    url.origin !== connection.origin ||
    !url.pathname.startsWith("/dashboard/")
  )
    throw new Error("Posting-engine origin was not accepted.");
  const { bridge, actor, actorTabId } = await current(connection);
  if (request.type === "COMPOSE_ENGINE_STATUS") {
    const value = await bridge.read(
      `/api/campaigns/publisher?actor_id=${actor.actor_id}&method=direct`,
    );
    if (
      !value ||
      typeof value !== "object" ||
      !("viewer_id" in value) ||
      value.viewer_id !== connection.viewer ||
      !("direct" in value) ||
      typeof value.direct !== "boolean"
    )
      throw new Error("Publisher status changed. Reconnect.");
    const presentation =
      actorTabId === null
        ? null
        : (
            await chrome.scripting.executeScript({
              target: { tabId: actorTabId },
              world: "MAIN",
              func: composeEngineActorName,
              args: [actor.actor_id],
            })
          )[0]?.result;
    return {
      ok: true,
      status: {
        viewer_id: connection.viewer,
        ...actor,
        ...(typeof presentation === "string" && presentation.trim()
          ? { actor_name: presentation.trim().slice(0, 160) }
          : {}),
        publisher_ready: value.direct,
        version: chrome.runtime.getManifest().version,
      },
    };
  }
  await startComposeRun(request.input, connection, verifyRunConnection);
  // Start the first eligible operation now; the persisted alarm is its watchdog.
  // Subsequent targets are driven only by the server's eligibility timestamp.
  void tickComposeRun(request.input.request_id, verifyRunConnection).catch(
    () => {},
  );
  return { ok: true, request_id: request.input.request_id };
}
async function verifyRunConnection(connection: ComposeEngineConnection) {
  const saved = await savedConnection();
  if (
    saved.generation !== connection.generation ||
    saved.viewer !== connection.viewer ||
    saved.tabId !== connection.tabId ||
    saved.actorId !== connection.actorId ||
    saved.origin !== connection.origin
  )
    throw new Error("Posting connection changed. Review before restarting.");
  return current(connection);
}
chrome.alarms.onAlarm.addListener((value) => {
  if (value.name.startsWith(COMPOSE_RUN_ALARM))
    void tickComposeRun(
      value.name.slice(COMPOSE_RUN_ALARM.length),
      verifyRunConnection,
    ).catch(() => {});
});

chrome.runtime.onMessage.addListener((message: unknown, sender, reply) => {
  if (
    !message ||
    typeof message !== "object" ||
    !("type" in message) ||
    !String(message.type).startsWith("COMPOSE_ENGINE_")
  )
    return false;
  const operation = operations.then(() => handle(message, sender));
  operations = operation.catch(() => {});
  void operation.then(reply).catch((error) =>
    reply({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "The posting engine could not accept this request.",
    }),
  );
  return true;
});
chrome.tabs.onUpdated?.addListener((tabId, change) => {
  if (change.status !== "complete") return;
  void savedConnection()
    .then(async (connection) => {
      if (connection.tabId === tabId) {
        await current(connection);
        await install(connection);
      }
    })
    .catch(() => {});
});
