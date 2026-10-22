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

export type OAuthEnvironment = {
  siteUrl?: string | undefined;
  vercel?: boolean | undefined;
  vercelEnvironment?: string | undefined;
  deploymentUrl?: string | undefined;
  branchUrl?: string | undefined;
};
export function isVercelPreview(env: OAuthEnvironment): boolean {
  return env.vercel === true && env.vercelEnvironment === "preview";
}
function vercelOrigin(host: string | undefined): string | null {
  // Exact Vercel-injected metadata only; never Host/X-Forwarded-Host or arbitrary
  // *.vercel.app requests. Reject ports, credentials, paths and malformed labels.
  if (
    !host ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/i.test(host)
  )
    return null;
  return `https://${host.toLowerCase()}`;
}
export function oauthTrustedOrigins(env: OAuthEnvironment): string[] {
  if (isVercelPreview(env)) {
    return [
      ...new Set(
        [vercelOrigin(env.deploymentUrl), vercelOrigin(env.branchUrl)].filter(
          (value): value is string => value !== null,
        ),
      ),
    ];
  }
  // Production/local retain the existing fixed-origin behavior. Preview does
  // NOT inherit SITE_URL: it may point to a different branch's working Preview.
  const origin = oauthSiteOrigin(env.siteUrl);
  return origin ? [origin] : [];
}
