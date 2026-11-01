import { NextResponse } from "next/server";
import { libraryRepository } from "@staysuite/database";
import {
  libraryCommandSchema,
  librarySnapshotSchema,
  libraryReplySchema,
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
    return reply({ error: "Library storage is not connected." }, 503);
  try {
    const client = await supabaseServer();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user || user.is_anonymous)
      return reply({ error: "Sign in to manage your library." }, 401);
    const viewer = request.headers.get("x-staysuite-viewer");
    if (viewer && viewer !== user.id)
      return reply(
        { error: "Your account changed. Reload before continuing." },
        409,
      );
    const repo = libraryRepository(client);
    if (method === "GET")
      return reply(librarySnapshotSchema.parse(await repo.snapshot()));
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 64000)
      return reply({ error: "Library command is too large." }, 413);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return reply({ error: "Enter a valid library command." }, 400);
    }
    const parsed = libraryCommandSchema.safeParse(body);
    if (!parsed.success)
      return reply(
        {
          error:
            parsed.error.issues[0]?.message ?? "Check the library command.",
        },
        400,
      );
    const input = parsed.data;
    const id =
      "template_id" in input
        ? input.template_id
        : "id" in input
          ? input.id
          : crypto.randomUUID();
    const revision = "revision" in input ? input.revision : 0;
    const payload =
      "category_ids" in input
        ? { category_ids: input.category_ids }
        : "group_ids" in input
          ? { name: input.name, group_ids: input.group_ids }
          : "name" in input
            ? { name: input.name }
            : "size" in input
              ? { size: input.size }
              : {};
    return reply(
      libraryReplySchema.parse(
        await repo.command(id, revision, input.operation, payload),
      ),
    );
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : "";
    if (code === "42501")
      return reply(
        { error: "This library item is not available to your account." },
        403,
      );
    if (code === "PT409" || code === "23505")
      return reply(
        {
          error:
            "This item changed or its name is already used. Reload before saving.",
        },
        409,
      );
    if (["22023", "22P02", "23514", "22003"].includes(code))
      return reply(
        { error: "Check the name, selected items, and library capacity." },
        400,
      );
    if (code === "55000")
      return reply(
        { error: "This template is being deleted. Reload your library." },
        409,
      );
    return reply(
      {
        error:
          "Library storage could not complete this operation. Reload before retrying.",
      },
      503,
    );
  }
}
export const GET = (request: Request) => handle(request, "GET");
export const POST = (request: Request) => handle(request, "POST");
