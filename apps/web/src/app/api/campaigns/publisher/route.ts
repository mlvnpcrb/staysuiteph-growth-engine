import { campaignActorIdSchema } from "@staysuite/validation";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
export async function GET(request?: Request) {
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
    const actorId = request
      ? new URL(request.url).searchParams.get("actor_id")
      : null;
    if (actorId !== null) {
      const method = new URL(request!.url).searchParams.get("method");
      if (method !== null && method !== "direct") return reply({error: "Unsupported publisher method."}, 400);
      const direct = method === "direct";
      const version = direct ? "0.4.0" : "0.3.2";
      const actor = campaignActorIdSchema.safeParse(actorId);
      if (!actor.success)
        return reply({ error: "Choose a valid Facebook profile." }, 400);
      const available = await client.rpc(direct ? "campaign_direct_publisher_ready" : "campaign_publisher_ready", {
        p_actor_id: actor.data,
      });
      if (available.error) {
        if (["PGRST202", "42883"].includes(available.error.code))
          return reply({
            viewer_id: user.id,
            classic: false,
            direct: false,
            adapter_version: version,
            validation_available: false,
          });
        throw available.error;
      }
      return reply({
        viewer_id: user.id,
        classic: !direct && available.data === true,
        direct: direct && available.data === true,
        adapter_version: version,
        validation_available: true,
      });
    }
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

