import { campaignDashboardOrigin } from "./campaign-dashboard";

/** Inspect only supported StaySuite dashboard tabs; never connect to a lookalike. */
export function detectCampaignDashboard(tabs: Pick<chrome.tabs.Tab, "id" | "url" | "active" | "lastAccessed">[]) {
  const candidates = tabs.flatMap((tab) => {
    if (tab.id === undefined || !tab.url) return [];
    try {
      const url = new URL(tab.url);
      if (!url.pathname.startsWith("/dashboard/")) return [];
      const origin = campaignDashboardOrigin(url.origin);
      return [{ tabId: tab.id, origin, active: tab.active, lastAccessed: tab.lastAccessed ?? 0 }];
    } catch { return []; }
  });
  return candidates.find((tab) => tab.active) ?? candidates.sort((a, b) => b.lastAccessed - a.lastAccessed)[0] ?? null;
}
