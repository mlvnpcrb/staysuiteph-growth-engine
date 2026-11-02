import { NextResponse } from "next/server";
import { automationFlowRepository } from "@staysuite/database";
import {
  automationCommandSchema,
  automationSnapshotSchema,
  automationReplySchema,
  automationFlowSchema,
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
    return reply({ error: "Automation storage is not connected." }, 503);
  try {
    const client = await supabaseServer();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user || user.is_anonymous)
      return reply({ error: "Sign in to manage automations." }, 401);
    const viewer = request.headers.get("x-staysuite-viewer");
    if (viewer && viewer !== user.id)
      return reply(
        { error: "Your account changed. Reload before continuing." },
        409,
      );
    const repo = automationFlowRepository(client);
    if (method === "GET") {
      const params = new URL(request.url).searchParams;
      if ([...params.keys()].some((key) => !["id", "history"].includes(key)))
        return reply({ error: "Choose a valid automation view." }, 400);
      const id = params.get("id"),
        history = params.get("history");
      if (
        (id !== null && !automationFlowSchema.shape.id.safeParse(id).success) ||
        (history !== null && !["true", "false"].includes(history))
      )
        return reply({ error: "Choose a valid automation view." }, 400);
      const snapshot = automationSnapshotSchema.parse(
        await repo.snapshot(id, history === "true"),
      );
      if (
        snapshot.viewer_id !== user.id ||
        snapshot.flows.some((flow) => flow.user_id !== user.id) ||
        snapshot.events.some((event) => event.user_id !== user.id)
      )
        throw new Error("Automation owner mismatch");
      return reply(snapshot);
    }
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 64000)
      return reply({ error: "Automation is too large." }, 413);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return reply({ error: "Enter a valid automation command." }, 400);
    }
    const parsed = automationCommandSchema.safeParse(body);
    if (!parsed.success)
      return reply(
        {
          error:
            parsed.error.issues[0]?.message ?? "Check the automation blocks.",
        },
        400,
      );
    const input = parsed.data,
      id = input.operation === "create" ? crypto.randomUUID() : input.id,
      revision = "revision" in input ? input.revision : 0;
    const payload =
      input.operation === "create" || input.operation === "save"
        ? { title: input.title, definition: input.definition }
        : input.operation === "enable"
          ? {
              reviewed: input.reviewed,
              digest: input.digest,
              actor_id: input.actor_id,
              actor_type: input.actor_type,
            }
          : {};
    const result = automationReplySchema.parse(
      await repo.command(id, revision, input.operation, payload),
    );
    if (result.flow && result.flow.user_id !== user.id)
      throw new Error("Automation owner mismatch");
    return reply(result);
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : "";
    if (code === "42501")
      return reply(
        { error: "This automation or post is unavailable to your account." },
        403,
      );
    if (["PT409", "23505"].includes(code))
      return reply(
        {
          error:
            "The automation, content or resources changed. Reload the review before continuing.",
        },
        409,
      );
    if (code === "55000")
      return reply(
        {
          error:
            "Pause and resolve the current submission, use posts outside other schedules/flows, and verify the exact Direct profile, media and group permissions before enabling.",
        },
        409,
      );
    if (["22023", "22P02", "23514", "23502"].includes(code))
      return reply(
        {
          error:
            "Check the title, Trigger, Post, Wait and Loop blocks and capacity.",
        },
        400,
      );
    return reply(
      {
        error:
          "Automation storage could not complete this request. Reload before retrying.",
      },
      503,
    );
  }
}
export const GET = (request: Request) => handle(request, "GET");
export const POST = (request: Request) => handle(request, "POST");
