import { NextResponse, type NextRequest } from "next/server";
import { environment } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code && environment().configured) {
    const client = await supabaseServer();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(new URL("/dashboard/overview", request.url));
  }
  return NextResponse.redirect(new URL("/login?error=callback", request.url));
}
