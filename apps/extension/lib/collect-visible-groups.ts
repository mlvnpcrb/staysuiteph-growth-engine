/** Serialized by chrome.scripting: keep this function self-contained, with no imports.
 * Reads only visible group-link labels on the user's joined-groups directory.
 * Does not fetch, scroll, click, read posts, or access cookies/storage.
 * A separate user-started workspace orchestrates scrolling between these snapshots.
 */
export function collectVisibleGroups() {
  const current = new URL(location.href);
  if (
    current.protocol !== "https:" ||
    current.port ||
    !["facebook.com", "www.facebook.com", "m.facebook.com"].includes(
      current.hostname,
    ) ||
    !/^\/groups\/(joins|your_groups)\/?$/.test(current.pathname)
  )
    return {
      error: "Open Facebook’s Your Groups page first, then collect again.",
    };
  const visible = (element: Element) => {
    const bounds = element.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0 || bounds.bottom <= 0 || bounds.right <= 0 || bounds.top >= innerHeight || bounds.left >= innerWidth) return false;
    for (let parent: Element | null = element; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.display === "none" || style.visibility !== "visible" || style.opacity === "0" || parent.hasAttribute("hidden") || parent.getAttribute("aria-hidden") === "true") return false;
    }
    return true;
  };
  if (document.hidden) return { error: "Keep your Facebook groups tab visible while syncing." };
  const challenge = [...document.querySelectorAll('iframe[src*="captcha"], form[action*="checkpoint"]')].some(visible);
  if (challenge || /captcha|security check|temporarily blocked|account restricted/i.test(document.title))
    return { error: "Facebook is showing an account check or restriction. Sync stopped; review it directly in Facebook." };
  const modal = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].find(visible);
  if (modal) return { error: "Close the open Facebook dialog before syncing. This does not mean your account is restricted." };
  const main = document.querySelector('main, [role="main"]');
  if (!main)
    return {
      error:
        "The joined-groups list was not found. Facebook may have changed its layout.",
    };
  const groups: { url: string; title: string }[] = [];
  const seen = new Set<string>();
  let inspected = 0;
  for (const anchor of main.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    if (++inspected > 3000 || groups.length >= 100) break;
    if (anchor.closest('[hidden], [aria-hidden="true"], [inert]')) continue;
    const bounds = anchor.getBoundingClientRect();
    const style = getComputedStyle(anchor);
    if (
      bounds.width <= 0 ||
      bounds.height <= 0 ||
      bounds.bottom <= 0 ||
      bounds.right <= 0 ||
      bounds.top >= innerHeight ||
      bounds.left >= innerWidth ||
      style.visibility !== "visible" ||
      style.display === "none" ||
      style.opacity === "0"
    )
      continue;
    let hiddenParent = false;
    for (
      let parent = anchor.parentElement;
      parent;
      parent = parent.parentElement
    ) {
      const parentStyle = getComputedStyle(parent);
      if (parentStyle.opacity === "0" || parentStyle.visibility !== "visible") {
        hiddenParent = true;
        break;
      }
    }
    if (hiddenParent) continue;
    // Exclude covered/clipped links rather than exporting a non-visible label.
    const x =
      (Math.max(0, bounds.left) + Math.min(innerWidth, bounds.right)) / 2;
    const y =
      (Math.max(0, bounds.top) + Math.min(innerHeight, bounds.bottom)) / 2;
    const hit = document.elementFromPoint(x, y);
    if (!hit || !anchor.contains(hit)) continue;
    let url: URL;
    try {
      url = new URL(anchor.href);
    } catch {
      continue;
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !["facebook.com", "www.facebook.com", "m.facebook.com"].includes(
        url.hostname,
      )
    )
      continue;
    const identity = /^\/groups\/([a-zA-Z0-9._-]{1,160})\/?$/
      .exec(url.pathname)?.[1]
      ?.toLowerCase();
    if (
      !identity ||
      [
        "feed",
        "discover",
        "create",
        "search",
        "joins",
        "your_groups",
        "notifications",
      ].includes(identity) ||
      seen.has(identity)
    )
      continue;
    // innerText avoids exporting hidden text; never read surrounding posts or descriptions.
    const title = anchor.innerText.replace(/\s+/g, " ").trim().slice(0, 160);
    if (title.length < 2) continue;
    seen.add(identity);
    groups.push({ url: `https://www.facebook.com/groups/${identity}/`, title });
  }
  if (!groups.length)
    return {
      error:
        "No visible group names and links found. Scroll the joined-groups list yourself, then try again. Collection is incomplete and layout-dependent.",
    };
  return {
    format: "staysuite-visible-groups-v1",
    collected_at: new Date().toISOString(),
    groups,
  };
}
