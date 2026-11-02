/** CSRF boundary: compare with the incoming Host, never X-Forwarded-Host.
 * Next.js may construct request.url with its internal bind hostname.
 * Browsers cannot override Host while sending this origin's session cookies.
 * This does not grant redirect/OAuth trust to arbitrary hosts.
 */
export function hasSameRequestOrigin(request: Request) {
  const supplied = request.headers.get("origin");
  if (!supplied) return false;
  try {
    const origin = new URL(supplied);
    const target = new URL(request.url);
    const host = request.headers.get("host") ?? target.host;
    return (
      supplied === origin.origin &&
      ["http:", "https:"].includes(origin.protocol) &&
      origin.protocol === target.protocol &&
      origin.host === host.toLowerCase()
    );
  } catch {
    return false;
  }
}
