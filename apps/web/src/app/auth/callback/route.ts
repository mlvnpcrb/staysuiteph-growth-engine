import { NextResponse } from "next/server";
import { environment } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase";
export async function GET(request: Request) {
  const redirect = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.url));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  if (params.has("error")) return redirect("/login?error=callback");
  if (code && environment().configured) {
    try {
      const client = await supabaseServer();
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) return redirect("/dashboard/overview");
    } catch {
      // Fail closed on expired/missing PKCE verifier or an Auth outage.
    }
  }
  return redirect("/login?error=callback");
}
