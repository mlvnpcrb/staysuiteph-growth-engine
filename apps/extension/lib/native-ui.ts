import { installSuiteRuntime } from "@staysuite/ui";
import { NATIVE_BACKEND_HOST } from "./native-config";
let viewer = "";
export function setNativeViewer(value: string) {
  viewer = value;
}
export async function nativeMessage(
  message: unknown,
): Promise<Record<string, unknown>> {
  const result: unknown = await chrome.runtime.sendMessage(message);
  if (
    !result ||
    typeof result !== "object" ||
    !("ok" in result) ||
    result.ok !== true
  )
    throw new Error(
      result &&
      typeof result === "object" &&
      "error" in result &&
      typeof result.error === "string"
        ? result.error
        : "The extension could not complete this action.",
    );
  return result as Record<string, unknown>;
}
export async function allowNativeAccount() {
  if (!(await chrome.permissions.request({ origins: [NATIVE_BACKEND_HOST] })))
    throw new Error("Allow StaySuite account access to sign in.");
}
export const nativeHref = (href: string) => {
  const url = new URL(href, "https://native.staysuite.invalid");
  return chrome.runtime.getURL("popup.html") + url.search + "#" + url.pathname;
};
export function installNativeUi() {
  installSuiteRuntime({
    href: nativeHref,
    request: async (input, init) => {
      if (typeof input !== "string" || !input.startsWith("/api/"))
        return fetch(input, init);
      if (init?.signal?.aborted)
        throw new DOMException("Aborted", "AbortError");
      if (init?.body !== undefined && typeof init.body !== "string")
        throw new Error("Unsupported extension request body.");
      const pinned = viewer;
      const headers = new Headers(init?.headers);
      const expected = headers.get("x-staysuite-viewer") ?? pinned;
      if (!pinned || expected !== pinned)
        throw new Error("Your account changed. Sign in again.");
      const response = await nativeMessage({
        type: "NATIVE_API",
        path: input,
        method: init?.method ?? "GET",
        ...(init?.body === undefined ? {} : { body: init.body }),
        viewer: pinned,
      });
      if (init?.signal?.aborted || viewer !== pinned)
        throw new DOMException("Aborted", "AbortError");
      if (
        typeof response.body !== "string" ||
        typeof response.status !== "number" ||
        typeof response.content_type !== "string"
      )
        throw new Error("Invalid backend response.");
      return new Response(response.body, {
        status: response.status,
        headers: { "content-type": response.content_type },
      });
    },
    engine: async (operation, input) => {
      const response = await nativeMessage(
        operation === "status"
          ? { type: "NATIVE_ENGINE_STATUS" }
          : { type: "NATIVE_ENGINE_OPEN", input },
      );
      if (response.validation_required === true)
        window.dispatchEvent(
          new CustomEvent("staysuite:native-validation", { detail: response }),
        );
      return response;
    },
  });
}
