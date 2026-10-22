export function normalizeGroupUrl(input: string) {
  const url = new URL(input.trim());
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    !["facebook.com", "www.facebook.com", "m.facebook.com"].includes(
      url.hostname,
    )
  )
    throw new Error("Enter a Facebook Group link.");
  const match =
    /^\/groups\/([a-zA-Z0-9._-]{1,160})(?:\/(?:about|posts\/\d+|permalink\/\d+))?\/?$/.exec(
      url.pathname,
    );
  const identity = match?.[1]?.toLowerCase();
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
    ].includes(identity)
  )
    throw new Error("Enter a specific Facebook Group link.");
  return { identity, url: `https://www.facebook.com/groups/${identity}/` };
}
