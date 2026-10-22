import "server-only";
export function environment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return {
    url,
    key,
    configured: Boolean(url && key),
    demo: process.env.STAYSUITE_DEMO_MODE === "true",
  };
}
