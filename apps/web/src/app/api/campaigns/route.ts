import { NextResponse } from "next/server";
import { campaignRepository } from "@staysuite/database";
import { campaignCommandSchema } from "@staysuite/validation";
import { supabaseServer } from "@/lib/supabase";
import { environment } from "@/lib/env";
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
async function handle(request: Request, mutation: boolean) {
  if (mutation && request.headers.get("origin") !== new URL(request.url).origin)
    return reply({ error: "Request origin was not accepted." }, 403);
  if (!environment().configured)
    return reply({ error: "Campaign storage is not connected." }, 503);
  try {
    const client = await supabaseServer();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user || user.is_anonymous)
      return reply({ error: "Sign in to manage campaigns." }, 401);
    const expected = request.headers.get("x-staysuite-viewer");
    if (expected && expected !== user.id)
      return reply(
        { error: "Your StaySuite account changed. Reconnect." },
        409,
      );
    const repo = campaignRepository(client, user.id);
    if (!mutation)
      return reply({
        campaigns: await repo.list(),
        viewer_id: user.id,
        publishing_available: false,
      });
    const raw = await request.text();
    if (raw.length > 64000)
      return reply({ error: "Campaign is too large." }, 413);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return reply({ error: "Enter a valid campaign command." }, 400);
    }
    const parsed = campaignCommandSchema.safeParse(body);
    if (!parsed.success)
      return reply(
        { error: parsed.error.issues[0]?.message ?? "Check your campaign." },
        400,
      );
    const job = await repo.command(parsed.data);
    if (parsed.data.command === "reserve_media") {
      const media = job.media.find(
        (m) => m.position === parsed.data.payload.position,
      );
      if (!media)
        return reply({ error: "Media reservation was not confirmed." }, 409);
      const upload = await client.storage
        .from("campaign-media")
        .createSignedUploadUrl(media.object_path);
      if (upload.error) throw upload.error;
      return reply({
        job,
        upload: upload.data,
        viewer_id: user.id,
        publishing_available: false,
      });
    }
    return reply({ job, viewer_id: user.id, publishing_available: false });
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : "";
    if (["42P01", "42883", "PGRST202", "PGRST205"].includes(code))
      return reply(
        {
          error:
            "Campaign database setup is pending. Your existing groups are unchanged.",
        },
        503,
      );
    if (code === "42501")
      return reply(
        { error: "This campaign or selected account is not available to you." },
        403,
      );
    if (["PT409", "40001"].includes(code))
      return reply(
        { error: "Campaign changed. Reload and review it again." },
        409,
      );
    if (code === "55000")
      return reply(
        {
          error:
            "Publishing is unavailable or an earlier submission needs review. Nothing new was sent.",
        },
        409,
      );
    if (code === "22023")
      return reply(
        {
          error:
            "Check campaign details, uploaded media and current group permission reviews.",
        },
        400,
      );
    return reply(
      {
        error:
          "Campaign operation could not be completed. Reload before retrying.",
      },
      503,
    );
  }
}
export const GET = (request: Request) => handle(request, false);
export const POST = (request: Request) => handle(request, true);
