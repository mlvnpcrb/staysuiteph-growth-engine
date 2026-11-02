/** Injected in the connected StaySuite tab's ISOLATED world. No credentials cross this bridge. */
export function installComposeEngineBridge(origin: string, generation: string) {
  if (
    location.origin !== origin ||
    !location.pathname.startsWith("/dashboard/")
  )
    return;
  const root = globalThis as typeof globalThis & {
    __staysuiteComposeEngineListener?: (event: MessageEvent<unknown>) => void;
  };
  if (root.__staysuiteComposeEngineListener)
    window.removeEventListener(
      "message",
      root.__staysuiteComposeEngineListener,
    );
  const listener = (event: MessageEvent<unknown>) => {
    if (
      event.source !== window ||
      event.origin !== origin ||
      location.origin !== origin ||
      !location.pathname.startsWith("/dashboard/")
    )
      return;
    const data = event.data;
    if (
      !data ||
      typeof data !== "object" ||
      !("channel" in data) ||
      data.channel !== "staysuite-compose-engine-v1" ||
      !("direction" in data) ||
      data.direction !== "request" ||
      !("request_id" in data) ||
      typeof data.request_id !== "string" ||
      data.request_id.length > 80 ||
      !("operation" in data) ||
      !["status", "open"].includes(String(data.operation))
    )
      return;
    const message =
      data.operation === "status"
        ? { type: "COMPOSE_ENGINE_STATUS", generation }
        : {
            type: "COMPOSE_ENGINE_OPEN",
            generation,
            input: "input" in data ? data.input : null,
          };
    const request_id = data.request_id;
    void chrome.runtime
      .sendMessage(message)
      .then((result: unknown) => {
        if (location.origin === origin)
          window.postMessage(
            {
              channel: "staysuite-compose-engine-v1",
              direction: "response",
              request_id,
              result,
            },
            origin,
          );
      })
      .catch(() => {
        if (location.origin === origin)
          window.postMessage(
            {
              channel: "staysuite-compose-engine-v1",
              direction: "response",
              request_id,
              result: {
                ok: false,
                error: "Reconnect the StaySuite extension to this tab.",
              },
            },
            origin,
          );
      });
  };
  root.__staysuiteComposeEngineListener = listener;
  window.addEventListener("message", listener);
  window.postMessage(
    { channel: "staysuite-compose-engine-v1", direction: "ready" },
    origin,
  );
}
/** Optional public presentation only; never used to authorize a post. */
export function composeEngineActorName(expectedId: string) {
  try {
    if (location.origin !== "https://www.facebook.com") return null;
    const loader: unknown = Reflect.get(globalThis, "require");
    if (typeof loader !== "function") return null;
    const initial: unknown = loader("CurrentUserInitialData"),
      current: unknown = loader("CurrentUser");
    if (
      !initial ||
      typeof initial !== "object" ||
      !current ||
      typeof current !== "object"
    )
      return null;
    const get: unknown = Reflect.get(current, "getID"),
      id: unknown = Reflect.get(initial, "USER_ID"),
      profile: unknown = Reflect.get(initial, "PROFILE_ID"),
      name: unknown = Reflect.get(initial, "NAME");
    if (
      typeof get !== "function" ||
      id !== expectedId ||
      String(get.call(current)) !== expectedId ||
      (profile != null && String(profile) !== expectedId) ||
      typeof name !== "string"
    )
      return null;
    return name.trim().slice(0, 160) || null;
  } catch {
    return null;
  }
}
