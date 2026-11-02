import {
  COMPOSE_ENGINE_CONNECTION,
  composeEngineConnectionSchema,
  type ComposeEngineConnection,
} from "@staysuite/validation";
import { nativeCampaignBridge, nativeUser } from "./native-backend";
import { campaignFacebookActor } from "./campaign-dashboard";
import { composeEngineActorName } from "./compose-engine-page";

export async function nativeFacebook() {
  if (
    !(await chrome.permissions.contains({
      origins: ["https://www.facebook.com/*"],
    }))
  )
    throw new Error("Connect Facebook in the extension first.");
  let found: {
    actor: { actor_id: string; actor_type: "personal" };
    actorTabId: number;
  } | null = null;
  for (const tab of (
    await chrome.tabs.query({ url: "https://www.facebook.com/*" })
  ).slice(0, 5)) {
    if (tab.id === undefined || tab.status !== "complete") continue;
    const actor = (
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: campaignFacebookActor,
      })
    )[0]?.result;
    if (!actor) continue;
    if (found && found.actor.actor_id !== actor.actor_id)
      throw new Error("Facebook tabs disagree about the active profile.");
    found = { actor, actorTabId: tab.id };
  }
  if (!found)
    throw new Error(
      "Keep a signed-in Facebook tab open. StaySuite will reuse it without navigating it.",
    );
  return found;
}
export async function nativeCampaignContext(
  connection: ComposeEngineConnection,
) {
  const user = await nativeUser();
  if (
    connection.mode !== "native" ||
    connection.origin !== chrome.runtime.getURL("") ||
    user.id !== connection.viewer
  )
    throw new Error("The StaySuite account changed. Review the post again.");
  const saved = composeEngineConnectionSchema.safeParse(
    (await chrome.storage.session.get(COMPOSE_ENGINE_CONNECTION))[
      COMPOSE_ENGINE_CONNECTION
    ],
  );
  if (!saved.success || saved.data.generation !== connection.generation)
    throw new Error("The posting identity changed. Review the post again.");
  const { actor, actorTabId } = await nativeFacebook();
  if (actor.actor_id !== connection.actorId)
    throw new Error("Facebook identity changed. Nothing new was sent.");
  return { actor, actorTabId, bridge: nativeCampaignBridge(user.id) };
}
export async function nativeEngineStatus() {
  const user = await nativeUser();
  const { actor, actorTabId } = await nativeFacebook();
  const prior = composeEngineConnectionSchema.safeParse(
    (await chrome.storage.session.get(COMPOSE_ENGINE_CONNECTION))[
      COMPOSE_ENGINE_CONNECTION
    ],
  );
  const connection: ComposeEngineConnection =
    prior.success &&
    prior.data.mode === "native" &&
    prior.data.viewer === user.id &&
    prior.data.actorId === actor.actor_id
      ? prior.data
      : {
          tabId: 0,
          origin: chrome.runtime.getURL(""),
          viewer: user.id,
          actorId: actor.actor_id,
          generation: crypto.randomUUID(),
          connected_at: Date.now(),
          mode: "native",
        };
  await chrome.storage.session.set({ [COMPOSE_ENGINE_CONNECTION]: connection });
  const bridge = nativeCampaignBridge(user.id);
  const publisher = await bridge.read(
    `/api/campaigns/publisher?actor_id=${actor.actor_id}&method=direct`,
  );
  if (
    !publisher ||
    typeof publisher !== "object" ||
    !("viewer_id" in publisher) ||
    publisher.viewer_id !== user.id ||
    !("direct" in publisher) ||
    typeof publisher.direct !== "boolean"
  )
    throw new Error("Publisher availability could not be verified.");
  const name = (
    await chrome.scripting.executeScript({
      target: { tabId: actorTabId },
      world: "MAIN",
      func: composeEngineActorName,
      args: [actor.actor_id],
    })
  )[0]?.result;
  return {
    connection,
    status: {
      viewer_id: user.id,
      ...actor,
      ...(name ? { actor_name: name } : {}),
      publisher_ready: publisher.direct,
      version: chrome.runtime.getManifest().version,
    },
  };
}
