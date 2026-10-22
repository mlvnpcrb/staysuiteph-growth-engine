export function oauthSiteOrigin(siteUrl: string | undefined): string | null {
  if (!siteUrl) return null;
  try {
    const site = new URL(siteUrl);
    const local =
      site.hostname === "localhost" || site.hostname === "127.0.0.1";
    if (
      site.username ||
      site.password ||
      site.search ||
      site.hash ||
      site.pathname !== "/" ||
      (site.protocol !== "https:" && !(local && site.protocol === "http:"))
    )
      return null;
    return site.origin;
  } catch {
    return null;
  }
}
