"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { signInSchema } from "@staysuite/validation";
import { environment } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase";
import { AuthCookieWriteError, logOAuth } from "@/lib/oauth-diagnostics";
import { oauthSiteOrigin } from "@/lib/oauth-origin";
export async function signIn(form: FormData) {
  if (!environment().configured) redirect("/login?error=configuration");
  const result = signInSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!result.success) redirect("/login?error=invalid");
  const client = await supabaseServer();
  const { error } = await client.auth.signInWithPassword(result.data);
  if (error) redirect("/login?error=credentials");
  redirect("/dashboard/overview");
}
export async function signOut() {
  if (environment().configured) {
    const client = await supabaseServer();
    const { error } = await client.auth.signOut();
    if (error) redirect("/login?error=logout");
  }
  redirect("/login");
}

export async function signInWithGoogle() {
  const env = environment();
  const origin = oauthSiteOrigin(env.siteUrl);
  if (!env.configured || !origin) {
    logOAuth("oauth_configuration_invalid");
    redirect("/login?error=configuration");
  }
  // Next.js additionally enforces Server Action Origin/Host CSRF checks. This
  // comparison prevents PKCE cookies being created on a different Preview host.
  const requestOrigin = (await headers()).get("origin");
  if (!requestOrigin) {
    logOAuth("oauth_origin_missing");
    redirect("/login?error=configuration");
  }
  if (requestOrigin !== origin) {
    logOAuth("oauth_origin_mismatch");
    // No authorization code or verifier is forwarded between hostnames.
    redirect(new URL("/login", origin).href);
  }
  const callback = new URL("/auth/callback", origin).href;
  let authorizeUrl: string | undefined;
  try {
    const client = await supabaseServer({ requireCookieWrites: true });
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback, skipBrowserRedirect: true },
    });
    if (!error) authorizeUrl = data.url ?? undefined;
  } catch (error) {
    logOAuth(
      error instanceof AuthCookieWriteError
        ? "oauth_cookie_write_failed"
        : "oauth_start_failed",
    );
    redirect("/login?error=oauth");
  }
  if (!authorizeUrl) {
    logOAuth("oauth_start_failed");
    redirect("/login?error=oauth");
  }
  redirect(authorizeUrl);
}
