import { NextResponse } from "next/server";
import { environment } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase";
export async function GET(request: Request) {
  const redirect = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.url));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };
  const code = new URL(request.url).searchParams.get("code");
  if (code && environment().configured) {
    const client = await supabaseServer();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return redirect("/dashboard/overview");
  }
  return redirect("/login?error=callback");
}
