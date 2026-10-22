/** Chrome exception text is inspected locally but never returned or logged: it may
 * contain page URLs, query parameters or other account-related information. */
export function collectionError(error: unknown): {
  category: string;
  message: string;
} {
  const text = error instanceof Error ? error.message : "";
  if (/extension context invalidated/i.test(text))
    return {
      category: "extension_reloaded",
      message:
        "The extension was updated or reloaded. Close this popup, reload your Facebook tab, and open the extension again.",
    };
  if (/no tab with id|tab (?:was )?closed|frame (?:was )?removed/i.test(text))
    return {
      category: "tab_unavailable",
      message:
        "The selected tab closed or changed. Select Your Groups and open the extension again.",
    };
  if (
    /cannot access (?:a )?(?:chrome|edge|about|chrome-extension):|extensions gallery cannot be scripted/i.test(
      text,
    )
  )
    return {
      category: "unsupported_tab",
      message:
        "Chrome cannot collect from this browser page. Open Facebook’s Your Groups tab and click the extension there.",
    };
  if (
    /cannot access contents|missing host permission|permission|not allowed to access/i.test(
      text,
    )
  )
    return {
      category: "browser_permission_denied",
      message:
        "Chrome denied access to the selected tab. Reload the extension in chrome://extensions, reload Your Groups, and click the extension on that tab. This is not evidence of a Facebook account restriction.",
    };
  return {
    category: "collection_unavailable",
    message:
      "Collection could not run. Reload the extension and Your Groups tab, then try again. The cause is not established; no Facebook account restriction has been confirmed.",
  };
}
