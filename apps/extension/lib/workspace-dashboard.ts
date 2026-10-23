import { safeDashboardUrl, collectedGroupSchema } from "@staysuite/validation";
import type { DirectoryGroup } from "./directory-sync";

/** Runs in the authenticated dashboard, with cookies confined to that origin. */
export async function dashboardRequest(origin: string, viewer: string, group: DirectoryGroup | null) {
  if (location.origin !== origin || location.pathname !== "/dashboard/my-groups")
    return { error: "Open My Groups in StaySuite before connecting." };
  try {
    const response = await fetch("/api/groups", {
      method: group ? "POST" : "GET", credentials: "same-origin", redirect: "error",
      headers: { "content-type": "application/json", ...(viewer ? { "x-staysuite-viewer": viewer } : {}) },
      ...(group ? { body: JSON.stringify(group) } : {}), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return { error: response.status === 401 ? "Sign in to StaySuite, then reconnect." : response.status === 409 ? "Your StaySuite account changed. Reconnect before syncing." : "StaySuite could not save groups. Check account access and available capacity, then retry." };
    const data = await response.json();
    if (group) {
      if (data.group?.user_id !== viewer || data.group?.url !== group.url) return { error: "StaySuite did not confirm this save. Reconnect before retrying." };
      return { saved: true, duplicate: data.duplicate === true };
    }
    if (viewer) window.dispatchEvent(new Event("staysuite:groups-synced"));
    if (typeof data.viewer_id !== "string" || !Array.isArray(data.groups)) return { error: "This dashboard needs the latest Sync groups update." };
    return { viewer: data.viewer_id, groups: data.groups.map((item: {url: string; title: string}) => ({ url: item.url, title: item.title })) };
  } catch { return { error: "StaySuite could not be reached. Check the dashboard and reconnect." }; }
}

export async function requestDashboard(tabId: number, configuredUrl: string, viewer = "", group: DirectoryGroup | null = null) {
  const origin = safeDashboardUrl(configuredUrl);
  const results = await chrome.scripting.executeScript({ target: { tabId }, func: dashboardRequest, args: [origin, viewer, group] });
  const result = results[0]?.result;
  if (!result || result.error) throw new Error(result?.error ?? "The StaySuite tab is unavailable.");
  return { ...result, groups: (result.groups ?? []).slice(0, 500).map((value: unknown) => collectedGroupSchema.parse(value)) };
}
