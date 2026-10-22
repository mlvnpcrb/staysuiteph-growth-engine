import "server-only";
export function environment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return {
    siteUrl: process.env.SITE_URL,
    vercel: process.env.VERCEL === "1",
    vercelEnvironment: process.env.VERCEL_ENV,
    deploymentUrl: process.env.VERCEL_URL,
    branchUrl: process.env.VERCEL_BRANCH_URL,
    url,
    key,
    configured: Boolean(url && key),
    demo: process.env.STAYSUITE_DEMO_MODE === "true",
  };
}
