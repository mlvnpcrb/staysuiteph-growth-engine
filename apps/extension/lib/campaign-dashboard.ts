import {
  safeDashboardUrl,
  campaignCommandSchema,
  campaignCommandReplySchema,
  campaignListSchema,
  campaignRestoreSchema,
  type CampaignCommand,
} from "@staysuite/validation";
export function campaignDashboardOrigin(value: string) {
  const origin = safeDashboardUrl(value),
    url = new URL(origin);
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) &&
    !(
      url.hostname.startsWith("staysuiteph-growth-engine-") &&
      url.hostname.endsWith("-mlvnpcrbs-projects.vercel.app")
    )
  )
    throw new Error(
      "Use your StaySuite Preview URL or local development workspace.",
    );
  return origin;
}
/** ISOLATED dashboard execution. Session cookies never leave this origin. */
export async function campaignDashboardRequest(
  origin: string,
  viewer: string,
  path: string,
  command: CampaignCommand | null,
) {
  if (
    location.origin !== origin ||
    !location.pathname.startsWith("/dashboard/")
  )
    return { error: "Open a signed-in StaySuite dashboard tab first." };
  if (
    !/^\/api\/(campaigns(?:\?id=[0-9a-f-]+|\/publisher(?:\?actor_id=[1-9][0-9]{0,79}(?:&method=direct)?)?)?|groups)$/.test(
      path,
    )
  )
    return { error: "Unsupported campaign request." };
  try {
    const response = await fetch(path, {
      method: command ? "POST" : "GET",
      credentials: "same-origin",
      redirect: "error",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        ...(viewer ? { "x-staysuite-viewer": viewer } : {}),
      },
      ...(command ? { body: JSON.stringify(command) } : {}),
      signal: AbortSignal.timeout(20000),
    });
    const data: unknown = await response.json();
    if (!response.ok)
      return {
        error:
          response.status === 401
            ? "Sign in to StaySuite, then reconnect."
            : response.status === 409
              ? "Campaign or account changed. Reconnect and review it again."
              : response.status === 403
                ? "This account cannot access the campaign."
                : "Campaign operation is unavailable. Nothing new was sent.",
      };
    return { data };
  } catch {
    return {
      error:
        "StaySuite could not be reached. Check the dashboard before retrying.",
    };
  }
}
export function campaignDashboard(
  tabId: number,
  origin: string,
  viewer: string,
) {
  if (campaignDashboardOrigin(origin) !== origin)
    throw new Error("Invalid campaign workspace origin.");
  const read = async (path: string, command: CampaignCommand | null = null) => {
    const response = (
      await chrome.scripting.executeScript({
        target: { tabId },
        world: "ISOLATED",
        func: campaignDashboardRequest,
        args: [origin, viewer, path, command],
      })
    )[0]?.result;
    if (!response || response.error)
      throw new Error(
        response?.error || "The connected StaySuite tab closed. Reconnect.",
      );
    return response.data;
  };
  return {
    read,
    async list() {
      return campaignListSchema.parse(await read("/api/campaigns"));
    },
    async restore(id: string) {
      return campaignRestoreSchema.parse(await read(`/api/campaigns?id=${id}`));
    },
    async command(command: CampaignCommand) {
      const parsed = campaignCommandSchema.parse(command);
      // Uploads and arbitrary payload transport do not belong to the execution bridge.
      if (
        ![
          "inspect",
          "validate_one",
          "confirm_validation",
          "bind_actor",
          "approve",
          "start",
          "resume",
          "claim",
          "pause",
          "cancel",
          "recover",
          "report",
        ].includes(parsed.command)
      )
        throw new Error("Unsupported extension command.");
      const result = campaignCommandReplySchema.parse(
        await read("/api/campaigns", parsed),
      );
      if (result.viewer_id !== viewer)
        throw new Error("StaySuite account changed. Reconnect.");
      return result.job;
    },
  };
}
/** Public page identity only. No cookies, request tokens or account credentials. */
export function campaignFacebookActor() {
  try {
    if (
      location.origin !== "https://www.facebook.com" ||
      /\/(login|checkpoint|disabled)(\/|$)/.test(location.pathname)
    )
      return null;
    const loader: unknown = Reflect.get(globalThis, "require");
    if (typeof loader !== "function") return null;
    const current: unknown = loader("CurrentUser"),
      initial: unknown = loader("CurrentUserInitialData");
    if (
      !current ||
      typeof current !== "object" ||
      !initial ||
      typeof initial !== "object"
    )
      return null;
    const get: unknown = Reflect.get(current, "getID"),
      user: unknown = Reflect.get(initial, "USER_ID"),
      profile: unknown = Reflect.get(initial, "PROFILE_ID");
    if (
      typeof get !== "function" ||
      typeof user !== "string" ||
      !/^[1-9]\d{0,79}$/.test(user) ||
      String(get.call(current)) !== user ||
      (profile != null && String(profile) !== user)
    )
      return null;
    return { actor_id: user, actor_type: "personal" as const };
  } catch {
    return null;
  }
}

