import { NextResponse } from "next/server";
import { campaignRepository } from "@staysuite/database";
import {
  campaignCommandSchema,
  campaignJobSchema,
  campaignIdSchema,
  campaignDeleteInputSchema,
} from "@staysuite/validation";
import { supabaseServer } from "@/lib/supabase";
import { environment } from "@/lib/env";
import { hasSameRequestOrigin } from "@/lib/request-origin";
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
async function handle(request: Request, mutation: boolean, removal = false) {
  if (mutation && !hasSameRequestOrigin(request))
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
    if (removal) {
      const raw = await request.text();
      if (raw.length > 64000)
        return reply({ error: "Campaign command too large." }, 413);
      const input = campaignDeleteInputSchema.safeParse(JSON.parse(raw));
      if (!input.success)
        return reply({ error: "Check the campaign and version." }, 400);
      const prepared = await client.rpc("campaign_delete", {
        p_id: input.data.id,
        p_revision: input.data.revision,
        p_finish: false,
      });
      if (prepared.error) throw prepared.error;
      const job = campaignJobSchema.parse(prepared.data);
      const paths = job.media.map((asset) => asset.object_path);
      if (paths.length) {
        const removed = await client.storage
          .from("campaign-media")
          .remove(paths);
        if (removed.error) throw removed.error;
      }
      const result = await client.rpc("campaign_delete", {
        p_id: job.id,
        p_revision: job.revision,
        p_finish: true,
      });
      if (result.error) throw result.error;
      return reply({ deleted_id: job.id, viewer_id: user.id });
    }
    if (!mutation && new URL(request.url).searchParams.has("id")) {
      const id = campaignIdSchema.safeParse(
        new URL(request.url).searchParams.get("id"),
      );
      if (!id.success) return reply({ error: "Choose a saved campaign." }, 400);
      const job = await repo.command({
        id: id.data,
        revision: 0,
        command: "inspect",
        payload: {},
      });
      const assets = await Promise.all(
        job.media
          .filter((asset) => asset.uploaded)
          .map(async (asset) => {
            const signed = await client.storage
              .from("campaign-media")
              .createSignedUrl(asset.object_path, 300);
            if (signed.error) throw signed.error;
            return { id: asset.id, url: signed.data.signedUrl };
          }),
      );
      return reply({
        job,
        assets,
        viewer_id: user.id,
        publishing_available: false,
      });
    }
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

export const DELETE = (request: Request) => handle(request, true, true);
