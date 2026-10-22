import { NextResponse } from "next/server";
import { environment } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase";
import {
  callbackErrorCategory,
  logOAuth,
  type OAuthCategory,
} from "@/lib/oauth-diagnostics";
import { oauthTrustedOrigins } from "@/lib/oauth-origin";
export async function GET(request: Request) {
  const redirect = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.url));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };
  const failure = (category: OAuthCategory) => {
    logOAuth(category);
    return redirect("/login?error=callback");
  };
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  if (params.has("error")) return failure("callback_provider_error");
  if (!code) return failure("callback_missing_code");
  const env = environment();
  const origins = oauthTrustedOrigins(env);
  if (!env.configured || !origins.length)
    return failure("callback_not_configured");
  if (!origins.includes(new URL(request.url).origin))
    return failure("callback_origin_mismatch");
  try {
    const client = await supabaseServer({ requireCookieWrites: true });
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) return failure(callbackErrorCategory(error));
  } catch (error) {
    return failure(callbackErrorCategory(error, true));
  }
  return redirect("/dashboard/overview");
}
