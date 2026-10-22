/// <reference types="chrome" />
import {
  safeDashboardUrl,
  groupCollectionSchema,
  groupTransferAckSchema,
  type GroupCollection,
} from "@staysuite/validation";

/** Runs in the dashboard's isolated world. No imports/runtime closures inside. */
export async function deliverGroupCollection(input: {
  origin: string;
  transferId: string;
  collection: GroupCollection;
}) {
  const { origin, transferId, collection } = input;
  if (
    location.origin !== origin ||
    location.pathname !== "/dashboard/group-finder"
  )
    return { result: "not_ready" };
  const deadline = Date.now() + 12_000;
  while (!document.querySelector('[data-staysuite-group-receiver="ready"]')) {
    if (Date.now() >= deadline || location.origin !== origin)
      return { result: "not_ready" };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return new Promise<{ result: string }>((resolve) => {
    const finish = (result: string) => {
      clearTimeout(timer);
      window.removeEventListener("message", ack);
      resolve({ result });
    };
    const ack = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== origin) return;
      const data: unknown = event.data;
      if (
        !data ||
        typeof data !== "object" ||
        !("type" in data) ||
        data.type !== "STAYSUITE_GROUP_IMPORT_ACK" ||
        !("transfer_id" in data) ||
        data.transfer_id !== transferId ||
        !("result" in data)
      )
        return;
      if (
        typeof data.result === "string" &&
        ["received", "busy", "invalid_payload", "batch_limit"].includes(
          data.result,
        )
      )
        finish(data.result);
    };
    const timer = setTimeout(() => finish("not_ready"), 4000);
    window.addEventListener("message", ack);
    window.postMessage(
      { type: "STAYSUITE_GROUP_IMPORT", transfer_id: transferId, collection },
      origin,
    );
  });
}

export async function sendToDashboard(
  collection: GroupCollection,
  configuredUrl: string,
) {
  const validated = groupCollectionSchema.parse(collection);
  const origin = safeDashboardUrl(configuredUrl);
  // Chrome host permissions apply by host, not local TCP port. Delivery below
  // still checks the exact configured origin including its port.
  const destination = new URL(origin);
  const permissionPattern = `${destination.protocol}//${destination.hostname}/*`;
  // Only the configured host is requested, despite the manifest's Vercel eligibility.
  const allowed = await chrome.permissions.request({
    origins: [permissionPattern],
  });
  if (!allowed) throw new Error("dashboard_permission_denied");
  const tabs = await chrome.tabs.query({ url: permissionPattern });
  let tab = tabs.find((tab) => {
    try {
      const url = new URL(tab.url ?? "");
      return (
        url.origin === origin && url.pathname === "/dashboard/group-finder"
      );
    } catch {
      return false;
    }
  });
  if (!tab)
    tab = await chrome.tabs.create({
      url: `${origin}/dashboard/group-finder`,
      active: false,
    });
  if (!tab.id) throw new Error("dashboard_unavailable");
  const tabId = tab.id;
  const deadline = Date.now() + 15_000;
  while (tab.status !== "complete") {
    if (Date.now() >= deadline) throw new Error("dashboard_not_ready");
    await new Promise((resolve) => setTimeout(resolve, 250));
    tab = await chrome.tabs.get(tabId);
  }
  const transferId = crypto.randomUUID();
  const [response] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "ISOLATED",
    func: deliverGroupCollection,
    args: [{ origin, transferId, collection: validated }],
  });
  const result = response?.result;
  const parsed = groupTransferAckSchema.safeParse({
    type: "STAYSUITE_GROUP_IMPORT_ACK",
    transfer_id: transferId,
    result: result?.result,
  });
  if (!parsed.success) {
    throw new Error("dashboard_not_ready");
  }
  if (parsed.data.result !== "received") throw new Error(parsed.data.result);
  await chrome.tabs.update(tabId, { active: true }).catch(() => undefined);
  return { count: validated.groups.length };
}
