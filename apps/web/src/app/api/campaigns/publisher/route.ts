import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
export async function GET() {
  const reply = (body: unknown, status = 200) =>
    NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
  try {
    const client = await supabaseServer();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user || user.is_anonymous)
      return reply({ error: "Sign in to check publishing." }, 401);
    const publishers = await client
      .from("campaign_publishers")
      .select("method,enabled,verified_at");
    if (publishers.error) throw publishers.error;
    return reply({
      viewer_id: user.id,
      classic: publishers.data.some(
        (p) => p.method === "classic" && p.enabled && p.verified_at !== null,
      ),
    });
  } catch {
    return reply(
      {
        error: "Publisher availability could not be checked. Nothing was sent.",
      },
      503,
    );
  }
}
