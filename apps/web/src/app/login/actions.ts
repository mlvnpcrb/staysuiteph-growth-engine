"use server";
import { redirect } from "next/navigation";
import { signInSchema } from "@staysuite/validation";
import { environment } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase";
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
  if (!env.configured || !env.siteUrl) redirect("/login?error=configuration");
  let callback: string;
  try {
    const site = new URL(env.siteUrl);
    const local =
      site.hostname === "localhost" || site.hostname === "127.0.0.1";
    if (
      site.username ||
      site.password ||
      site.search ||
      site.hash ||
      site.pathname !== "/" ||
      (site.protocol !== "https:" && !(local && site.protocol === "http:"))
    ) {
      throw new Error("Invalid site origin");
    }
    callback = new URL("/auth/callback", site).href;
  } catch {
    redirect("/login?error=configuration");
  }
  let authorizeUrl: string | undefined;
  try {
    const client = await supabaseServer();
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback, skipBrowserRedirect: true },
    });
    if (!error) authorizeUrl = data.url ?? undefined;
  } catch {
    // Never expose provider responses, tokens, or authorization codes.
  }
  if (!authorizeUrl) redirect("/login?error=oauth");
  redirect(authorizeUrl);
}
