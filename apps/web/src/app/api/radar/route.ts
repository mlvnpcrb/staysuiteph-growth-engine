import { NextResponse } from "next/server";
import { radarRepository } from "@staysuite/database";
import {
  radarCommandSchema,
  radarReplySchema,
  radarPageSchema,
  radarQuerySchema,
  radarCursorSchema,
} from "@staysuite/validation";
import { supabaseServer } from "@/lib/supabase";
import { environment } from "@/lib/env";
import { hasSameRequestOrigin } from "@/lib/request-origin";
export const runtime = "nodejs";
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
async function handle(request: Request, method: "GET" | "POST") {
  if (method === "POST" && !hasSameRequestOrigin(request))
    return reply({ error: "Request origin was not accepted." }, 403);
  if (!environment().configured)
    return reply({ error: "Lead Radar storage is not connected." }, 503);
  try {
    const client = await supabaseServer();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user || user.is_anonymous)
      return reply({ error: "Sign in to use Lead Radar." }, 401);
    const viewer = request.headers.get("x-staysuite-viewer");
    if (viewer && viewer !== user.id)
      return reply(
        { error: "Your account changed. Reconnect before continuing." },
        409,
      );
    const repo = radarRepository(client, user.id);
    if (method === "GET") {
      const parsed = radarQuerySchema.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      );
      if (!parsed.success)
        return reply(
          { error: "Choose a valid profile and inbox filter." },
          400,
        );
      const input = parsed.data;
      let cursor: ReturnType<typeof radarCursorSchema.parse> | undefined;
      if (input.cursor) {
        try {
          cursor = radarCursorSchema.parse(
            JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")),
          );
        } catch {
          return reply({ error: "Reload the inbox to reset its page." }, 400);
        }
      }
      const [settings, rows] = await Promise.all([
        repo.settings(input.scope),
        repo.leads(input, cursor),
      ]);
      const leads = rows.slice(0, 100);
      const last = leads.at(-1);
      const next_cursor =
        rows.length > 100 && last
          ? Buffer.from(
              JSON.stringify({ at: last.discovered_at, id: last.id }),
            ).toString("base64url")
          : null;
      return reply(
        radarPageSchema.parse({
          viewer_id: user.id,
          scope: input.scope,
          settings,
          leads,
          next_cursor,
          server_time: new Date().toISOString(),
          capabilities: {
            scanning: false,
            ai: false,
            auto_reply: false,
            webhooks: false,
          },
        }),
      );
    }
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 64000)
      return reply({ error: "Radar command is too large." }, 413);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return reply({ error: "Enter a valid Radar command." }, 400);
    }
    const parsed = radarCommandSchema.safeParse(body);
    if (!parsed.success)
      return reply(
        {
          error: parsed.error.issues[0]?.message ?? "Check the Radar command.",
        },
        400,
      );
    const input = parsed.data;
    const revision = "revision" in input ? input.revision : 0;
    const payload =
      input.operation === "save_settings"
        ? input.settings
        : input.operation === "ingest"
          ? input.post
          : input.operation === "update_lead"
            ? { id: input.id, changes: input.changes }
            : input.operation === "delete_lead"
              ? { id: input.id }
              : { before: input.before };
    return reply(
      radarReplySchema.parse(
        await repo.command(input.scope, revision, input.operation, payload),
      ),
    );
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : "";
    if (code === "42501")
      return reply(
        {
          error: "This profile, group or lead is unavailable to your account.",
        },
        403,
      );
    if (["PT409", "23505"].includes(code))
      return reply({ error: "Radar data changed. Reload before saving." }, 409);
    if (["22023", "22P02", "23514", "22007", "22008", "23502"].includes(code))
      return reply(
        { error: "Check the Radar settings, post details and inbox capacity." },
        400,
      );
    return reply(
      {
        error:
          "Lead Radar storage could not complete this request. Reload before retrying.",
      },
      503,
    );
  }
}
export const GET = (request: Request) => handle(request, "GET");
export const POST = (request: Request) => handle(request, "POST");
