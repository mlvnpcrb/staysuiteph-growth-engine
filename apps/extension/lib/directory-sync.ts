import { groupCollectionSchema, type GroupCollection } from "@staysuite/validation";

export type DirectoryGroup = GroupCollection["groups"][number];
export type ScanReason = "loaded_end" | "stalled" | "limit" | "timeout" | "cancelled" | "blocked";
export type DirectoryProgress = { groups: DirectoryGroup[]; passes: number };

/** Original viewport-only orchestration. No Facebook network endpoints or credentials. */
export async function scanDirectory(options: {
  read: () => Promise<unknown>;
  scroll: () => Promise<{ moved: boolean; atEnd: boolean }>;
  wait: () => Promise<void>;
  signal: AbortSignal;
  progress: (progress: DirectoryProgress) => void;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const deadline = now() + 120_000;
  const groups = new Map<string, DirectoryGroup>();
  let endPasses = 0, stillPasses = 0, passes = 0;
  const finish = (reason: ScanReason, message = "") => ({ groups: [...groups.values()], reason, message, passes });
  while (passes < 160 && now() < deadline) {
    if (options.signal.aborted) return finish("cancelled");
    let raw: unknown;
    try { raw = await options.read(); }
    catch { return finish("blocked", "The Facebook tab could not be read. Reconnect and try again."); }
    if (options.signal.aborted) return finish("cancelled");
    const parsed = groupCollectionSchema.safeParse(raw);
    // An empty viewport can occur between virtualized rows. Other errors stop the scan.
    const empty = raw && typeof raw === "object" && "error" in raw && typeof raw.error === "string" && raw.error.startsWith("No visible group");
    if (!parsed.success && !empty) {
      const message = raw && typeof raw === "object" && "error" in raw && typeof raw.error === "string"
        ? raw.error : "The Facebook directory layout was not recognized.";
      return finish("blocked", message);
    }
    const prior = groups.size;
    if (parsed.success) for (const group of parsed.data.groups) {
      if (groups.size >= 500 && !groups.has(group.url)) break;
      groups.set(group.url, group);
    }
    passes++;
    options.progress({ groups: [...groups.values()], passes });
    if (groups.size >= 500) return finish("limit");
    if (options.signal.aborted) return finish("cancelled");
    let step: { moved: boolean; atEnd: boolean };
    try { step = await options.scroll(); }
    catch { return finish("blocked", "Sync stopped because the Facebook tab changed or became unavailable."); }
    endPasses = step.atEnd && groups.size === prior ? endPasses + 1 : 0;
    stillPasses = !step.moved && groups.size === prior ? stillPasses + 1 : 0;
    if (endPasses >= 4) return finish("loaded_end");
    if (stillPasses >= 8) return finish("stalled");
    await options.wait();
  }
  return finish("timeout");
}

/** Serialized by Chrome. Scrolls only the joined-groups directory, never clicks. */
export function scrollDirectory() {
  if (document.hidden || location.protocol !== "https:" || location.hostname !== "www.facebook.com" || !/^\/groups\/(joins|your_groups)\/?$/.test(location.pathname))
    throw new Error("directory_unavailable");
  if (/captcha|security check|temporarily blocked|account restricted/i.test(document.title))
    throw new Error("directory_blocked");
  const main = document.querySelector('main, [role="main"]');
  if (!main) throw new Error("directory_unavailable");
  const link = [...main.querySelectorAll<HTMLAnchorElement>('a[href*="/groups/"]')].find(element => {
    const r = element.getBoundingClientRect();
    return r.height > 0 && r.bottom > 0 && r.top < innerHeight;
  });
  let parent: Element | null = link?.parentElement ?? main;
  while (parent && parent !== document.body && parent !== document.documentElement) {
    if (parent.scrollHeight > parent.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(parent).overflowY)) break;
    parent = parent.parentElement;
  }
  const container = parent && parent !== document.body ? parent : document.scrollingElement;
  if (!container) throw new Error("directory_unavailable");
  const before = container.scrollTop;
  container.scrollTop = Math.min(container.scrollHeight, before + Math.max(100, container.clientHeight * 0.65));
  return { moved: container.scrollTop > before + 1, atEnd: container.scrollTop + container.clientHeight >= container.scrollHeight - 4 };
}
