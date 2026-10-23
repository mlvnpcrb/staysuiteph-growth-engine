/**
 * Original read-only provider. Chrome serializes this function into Facebook's
 * MAIN world. Request tokens never cross its return boundary. No vendor code.
 * Query identifiers are compatibility metadata observed in the supplied package;
 * prefer the current Facebook query module when available. Never run mutations.
 */
export async function readFacebookGroupPage(actorId: string, cursor: string | null) {
  let stage = "input", httpStatus: number | null = null;
  let querySource = "reviewed_fallback";
  const failure = (error: string) => ({ error, diagnostic: {stage,httpStatus,query:cursor === null ? "initial" : "pagination",querySource} });
  if (!/^[1-9]\d{0,79}$/.test(actorId) || (cursor !== null && (typeof cursor !== "string" || !cursor.length || cursor.length > 4096))) return failure("malformed_response");
  if (location.origin !== "https://www.facebook.com") return failure("access_denied");
  stage = "page_guard";
  const blocked = () => /\/(?:checkpoint|login|recover|disabled)(?:\/|$)/.test(location.pathname) ||
    /security check|temporarily blocked|account restricted|captcha/i.test(document.title) ||
    [...document.querySelectorAll('iframe[src*="captcha"],form[action*="checkpoint"],input[name="approvals_code"]')].some(element => {
      const bounds = element.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0 && getComputedStyle(element).visibility === "visible";
    });
  if (blocked()) return failure("challenge");
  const modules = new Map<string, Record<string, unknown>>();
  const names = ["CurrentUserInitialData", "DTSGInitialData", "LSD"];
  const pageRequire = (window as unknown as { require?: (name: string) => unknown }).require;
  if (typeof pageRequire === "function") for (const name of names) {
    try { const value = pageRequire(name); if (value && typeof value === "object") modules.set(name, value as Record<string, unknown>); } catch { /* Only known bootstrap modules are considered. */ }
  }
  // Bounded bootstrap fallback; never use a generic token regex or read posts.
  let budget = 40_000, bytes = 0;
  for (const script of [...document.querySelectorAll('script[type="application/json"]')].slice(0, 100)) {
    if (names.every(name => modules.has(name))) break;
    const text = script.textContent ?? "";
    bytes += text.length;
    if (bytes > 4_000_000) break;
    if (text.length > 500_000 || !names.some(name => text.includes(name))) continue;
    let root: unknown;
    try { root = JSON.parse(text); } catch { continue; }
    const stack: {value: unknown; depth: number}[] = [{value: root, depth: 0}];
    while (stack.length && budget-- > 0) {
      const item = stack.pop();
      if (!item || item.depth > 40 || !item.value || typeof item.value !== "object") continue;
      const value = item.value;
      if (Array.isArray(value) && typeof value[0] === "string" && names.includes(value[0]) && value[2] && typeof value[2] === "object" && !Array.isArray(value[2]) && !modules.has(value[0])) modules.set(value[0], value[2] as Record<string, unknown>);
      for (const child of Object.values(value)) if (child && typeof child === "object") stack.push({value: child, depth: item.depth + 1});
    }
  }
  stage = "bootstrap_identity";
  const identity = modules.get("CurrentUserInitialData");
  if (!identity || typeof identity.USER_ID !== "string") return failure("unsupported");
  if (identity.USER_ID === "0") return failure("signed_out");
  if (String(identity.USER_ID) !== actorId) return failure("account_changed");
  stage = "bootstrap_tokens";
  const token = modules.get("DTSGInitialData")?.token;
  const lsd = modules.get("LSD")?.token;
  if (typeof token !== "string" || !token || token.length > 2048 || typeof lsd !== "string" || !lsd || lsd.length > 2048) return failure("unsupported");
  const friendlyName = cursor === null ? "GroupsCometPinnedGroupsDialogQuery" : "GroupsCometUnpinnedGroupsPaginationListPaginatedQuery";
  let documentId = cursor === null ? "7740459739385247" : "7218669964900608";
  if (typeof pageRequire === "function") try {
    const current = pageRequire(`${friendlyName}.graphql`) as {params?: {id?: unknown; operationKind?: unknown}} | null;
    if (current?.params?.operationKind === "query" && typeof current.params.id === "string" && /^\d{10,25}$/.test(current.params.id)) { documentId = current.params.id; querySource = "page_module"; }
  } catch { /* The reviewed fallback ID must still pass live response validation. */ }
  const variables = cursor === null ? {ordering:["viewer_added"],scale:1} : {count:50,cursor,ordering:["viewer_added"],scale:1};
  const body = new URLSearchParams({__user:actorId,av:actorId,__a:"1",fb_dtsg:token,lsd,doc_id:documentId,fb_api_caller_class:"RelayModern",fb_api_req_friendly_name:friendlyName,variables:JSON.stringify(variables),server_timestamps:"true"});
  try {
    stage = "request";
    const response = await fetch("/api/graphql/", {method:"POST",credentials:"same-origin",redirect:"error",cache:"no-store",headers:{"content-type":"application/x-www-form-urlencoded","x-fb-lsd":lsd,"x-fb-friendly-name":friendlyName},body:body.toString(),signal:AbortSignal.timeout(20_000)});
    httpStatus = response.status;
    if (response.status === 429) return failure("rate_limited");
    if (response.status === 401) return failure("signed_out");
    if (response.status === 403) return failure("access_denied");
    if (!response.ok) return failure("network");
    if (Number(response.headers.get("content-length")) > 2_000_000) return failure("malformed_response");
    const text = await response.text();
    if (text.length > 2_000_000) return failure("malformed_response");
    if (blocked()) return failure("challenge");
    stage = "response_json";
    let payload: unknown;
    try { payload = JSON.parse(text.replace(/^for\s*\(\s*;;\s*\);\s*/, "")); } catch { return failure("unsupported"); }
    const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
    stage = "response_errors";
    const root = object(payload);
    if (!root || (Array.isArray(root.errors) && root.errors.length)) return failure("unsupported");
    stage = "group_connection";
    const viewer = object(object(root.data)?.viewer);
    const tab = object(viewer?.groups_tab);
    const connection = object(tab?.tab_groups_list);
    const page = object(connection?.page_info);
    if (!connection || !Array.isArray(connection.edges) || connection.edges.length > 100 || !page || typeof page.has_next_page !== "boolean") return failure("unsupported");
    stage = "group_nodes";
    const groups = new Map<string, {url: string; title: string}>();
    const collect = (edges: unknown[]) => {
      for (const edge of edges) {
        const node = object(object(edge)?.node);
        const id = typeof node?.id === "string" ? node.id : typeof node?.id === "number" && Number.isSafeInteger(node.id) ? String(node.id) : "";
        if (!/^[1-9]\d{0,79}$/.test(id) || typeof node?.name !== "string" || node.name.trim().length < 2) return false;
        groups.set(id, {url:`https://www.facebook.com/groups/${id}/`,title:node.name.trim().slice(0,160)});
      }
      return true;
    };
    const pinned = object(tab?.pinned_groups)?.edges;
    if ((pinned !== undefined && (!Array.isArray(pinned) || pinned.length > 100 || !collect(pinned))) || !collect(connection.edges) || groups.size > 200) return failure("malformed_response");
    stage = "pagination";
    const next = page.has_next_page ? page.end_cursor : null;
    if (next !== null && (typeof next !== "string" || !next.trim() || next.length > 4096)) return failure("malformed_response");
    stage = "actor_recheck";
    // Guard the actor again after awaiting the network. No tokens are returned.
    if (typeof pageRequire === "function") try { if (String((pageRequire("CurrentUserInitialData") as {USER_ID?: unknown})?.USER_ID) !== actorId) return failure("account_changed"); } catch { return failure("account_changed"); }
    return {actorId,actorName:typeof identity?.NAME === "string" && identity.NAME.trim() ? identity.NAME.trim().slice(0,120) : "Facebook profile",groups:[...groups.values()],hasNext:page.has_next_page,cursor:next as string | null};
  } catch { return failure("network"); }
}
