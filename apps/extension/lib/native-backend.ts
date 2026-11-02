import { createClient } from "./native-auth-client";
import type { Database } from "@staysuite/types";
import {
  createGroupsHandlers,
  createLibraryHandlers,
  createCampaignsHandlers,
  createPublisherHandlers,
  createTemplatesHandlers,
  createSchedulesHandlers,
  createRadarHandlers,
  createRadarExportHandlers,
  createFlowsHandlers,
  createFlowPrepareHandlers,
} from "@staysuite/backend";
import {
  campaignCommandSchema,
  campaignCommandReplySchema,
  campaignListSchema,
  campaignRestoreSchema,
  scheduleListSchema,
  scheduleTickReplySchema,
  type CampaignCommand,
} from "@staysuite/validation";

import {
  NATIVE_BACKEND_ORIGIN,
  NATIVE_BACKEND_HOST,
  publishableKey,
} from "./native-config";
let client: ReturnType<typeof createClient<Database>> | null = null;
let initializing: Promise<void> | null = null;
export async function nativeClient() {
  if (!initializing)
    initializing = chrome.storage.local.setAccessLevel({
      accessLevel: "TRUSTED_CONTEXTS",
    });
  await initializing;
  if (!(await chrome.permissions.contains({ origins: [NATIVE_BACKEND_HOST] })))
    throw new Error("Allow StaySuite account access in the extension first.");
  if (!client)
    client = createClient<Database>(NATIVE_BACKEND_ORIGIN, publishableKey, {
      auth: {
        storageKey: "staysuite-native-auth-v1",
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storage: {
          getItem: async (key) => {
            const value: unknown = (await chrome.storage.local.get(key))[key];
            return typeof value === "string" ? value : null;
          },
          setItem: async (key, value) => {
            await chrome.storage.local.set({ [key]: value });
          },
          removeItem: async (key) => {
            await chrome.storage.local.remove(key);
          },
        },
      },
    });
  return client;
}
export async function nativeUser() {
  const api = await nativeClient();
  const {
    data: { user },
    error,
  } = await api.auth.getUser();
  if (error || !user || user.is_anonymous)
    throw new Error("Sign in to StaySuite in the extension.");
  return { id: user.id, email: user.email ?? "" };
}
export async function nativeSignIn(email: string, password: string) {
  if (
    email.length > 254 ||
    password.length > 1024 ||
    !email.trim() ||
    !password
  )
    throw new Error("Enter your StaySuite email and password.");
  const api = await nativeClient();
  const result = await api.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (result.error)
    throw new Error("Sign-in failed. Check your StaySuite email and password.");
  return nativeUser();
}
export async function nativeSignOut() {
  const api = await nativeClient();
  const { error } = await api.auth.signOut({ scope: "local" });
  if (error) throw new Error("Sign-out was not confirmed. Try again.");
}
const services = { configured: () => true, client: nativeClient };
type Handler = (request: Request) => Promise<Response>;
const routes: Record<string, Partial<Record<string, Handler>>> = {
  "/api/groups": createGroupsHandlers(services),
  "/api/library": createLibraryHandlers(services),
  "/api/campaigns": createCampaignsHandlers(services),
  "/api/campaigns/publisher": createPublisherHandlers(services),
  "/api/templates": createTemplatesHandlers(services),
  "/api/schedules": createSchedulesHandlers(services),
  "/api/radar": createRadarHandlers(services),
  "/api/radar/export": createRadarExportHandlers(services),
  "/api/automation-flows": createFlowsHandlers(services),
  "/api/automation-flows/prepare": createFlowPrepareHandlers(services),
};
/** Internal authenticated transport, reachable only from the extension's own UI. */
export async function nativeRequest(
  path: string,
  method: string,
  body: string | undefined,
  viewer: string,
) {
  if (
    path.length > 1000 ||
    !path.startsWith("/api/") ||
    path.startsWith("//") ||
    (body?.length ?? 0) > 96000
  )
    throw new Error("Unsupported extension request.");
  const url = new URL(path, "https://native.staysuite.invalid");
  const handler = routes[url.pathname]?.[method];
  if (!handler || url.origin !== "https://native.staysuite.invalid")
    throw new Error("Unsupported extension request.");
  const user = await nativeUser();
  if (viewer !== user.id)
    throw new Error("Your StaySuite account changed. Sign in again.");
  // This local Request is never sent to a website. The same handlers enforce user/RLS,
  // input schemas, revision gates and media verification in both application surfaces.
  const request = new Request(url, {
    method,
    headers: {
      origin: url.origin,
      "content-type": "application/json",
      "x-staysuite-viewer": viewer,
    },
    ...(body === undefined ? {} : { body }),
  });
  const response = await handler(request);
  return {
    status: response.status,
    body: await response.text(),
    content_type: response.headers.get("content-type") ?? "application/json",
  };
}
export function nativeCampaignBridge(viewer: string) {
  const read = async (
    path: string,
    command: unknown = null,
  ): Promise<unknown> => {
    const result = await nativeRequest(
      path,
      command === null ? "GET" : "POST",
      command === null ? undefined : JSON.stringify(command),
      viewer,
    );
    const value: unknown = JSON.parse(result.body);
    if (result.status >= 400)
      throw new Error(
        value &&
        typeof value === "object" &&
        "error" in value &&
        typeof value.error === "string"
          ? value.error
          : "StaySuite operation failed.",
      );
    return value;
  };
  return {
    read,
    async list() {
      const value = campaignListSchema.parse(await read("/api/campaigns"));
      if (value.viewer_id !== viewer) throw new Error("Account changed.");
      return value;
    },
    async restore(id: string) {
      const value = campaignRestoreSchema.parse(
        await read(`/api/campaigns?id=${id}`),
      );
      if (value.viewer_id !== viewer) throw new Error("Account changed.");
      return value;
    },
    async command(input: CampaignCommand) {
      const value = campaignCommandReplySchema.parse(
        await read("/api/campaigns", campaignCommandSchema.parse(input)),
      );
      if (value.viewer_id !== viewer) throw new Error("Account changed.");
      return value.job;
    },
    async schedules() {
      const value = scheduleListSchema.parse(await read("/api/schedules"));
      if (value.viewer_id !== viewer) throw new Error("Account changed.");
      return value;
    },
    async scheduleTick(actor: {
      actor_id: string;
      actor_type: "personal" | "page";
    }) {
      const value = scheduleTickReplySchema.parse(
        await read("/api/schedules", { operation: "tick", ...actor }),
      );
      if (value.viewer_id !== viewer) throw new Error("Account changed.");
      return value.result.campaign_ids;
    },
  };
}
