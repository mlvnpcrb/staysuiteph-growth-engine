import { NextResponse } from "next/server";
import { groupRepository } from "@staysuite/database";
import {
  addGroupSchema,
  marketingUpdateSchema,
  duplicateCheckSchema,
  updateGroupSchema,
  deleteGroupSchema,
  normalizeGroupUrl,
} from "@staysuite/validation";
import { supabaseServer } from "@/lib/supabase";
import { environment } from "@/lib/env";
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
async function handle(
  request: Request,
  method: "GET" | "POST" | "PATCH" | "DELETE",
) {
  if (
    method !== "GET" &&
    request.headers.get("origin") !== new URL(request.url).origin
  )
    return reply({ error: "Request origin was not accepted." }, 403);
  if (!environment().configured)
    return reply(
      {
        error:
          "Saving groups is not connected yet. Search links and assessments are still available.",
      },
      503,
    );
  try {
    const client = await supabaseServer();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user || user.is_anonymous)
      return reply({ error: "Please sign in to manage your groups." }, 401);
    const repository = groupRepository(client, user.id);
    if (method === "GET")
      return reply({ ...(await repository.list()), limit: 500 });
    const text = await request.text();
    if (text.length > 64000)
      return reply({ error: "This entry is too long." }, 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return reply({ error: "Enter a valid group entry." }, 400);
    }
    if (
      method === "POST" &&
      body &&
      typeof body === "object" &&
      "operation" in body &&
      body.operation === "check_duplicates"
    ) {
      const parsed = duplicateCheckSchema.safeParse(body);
      if (!parsed.success)
        return reply({ error: "Check up to 100 group links at a time." }, 400);
      let identities: string[];
      try {
        identities = [
          ...new Set(
            parsed.data.urls.map((url) => normalizeGroupUrl(url).identity),
          ),
        ];
      } catch {
        return reply({ error: "Enter valid Facebook Group links." }, 400);
      }
      return reply({ identities: await repository.duplicates(identities) });
    }
    if (text.length > 16000)
      return reply({ error: "This entry is too long." }, 413);
    if (method === "POST") {
      const parsed = addGroupSchema.safeParse(body);
      if (!parsed.success)
        return reply(
          {
            error:
              parsed.error.issues[0]?.message ?? "Check your group details.",
          },
          400,
        );
      const input = parsed.data;
      const { identity } = normalizeGroupUrl(input.url);
      return reply(await repository.save({ ...input, identity }));
    }
    if (
      method === "PATCH" &&
      body &&
      typeof body === "object" &&
      "operation" in body &&
      body.operation === "marketing_evidence"
    ) {
      const parsed = marketingUpdateSchema.safeParse(body);
      if (!parsed.success)
        return reply(
          { error: parsed.error.issues[0]?.message ?? "Check the evidence." },
          400,
        );
      const existing = await repository.find(parsed.data.id);
      if (!existing) return reply({ error: "Group not found." }, 404);
      const evidence = parsed.data.marketing_evidence;
      if (evidence.observed_at && Date.parse(evidence.observed_at) > Date.now())
        return reply(
          { error: "Observation date cannot be in the future." },
          400,
        );
      if (
        evidence.source_url &&
        normalizeGroupUrl(evidence.source_url).identity !== existing.identity
      )
        return reply({ error: "Source link must identify this group." }, 400);
      const group = await repository.updateMarketing(parsed.data.id, evidence);
      return group
        ? reply({ group })
        : reply({ error: "Group not found." }, 404);
    }
    if (method === "PATCH") {
      const parsed = updateGroupSchema.safeParse(body);
      if (!parsed.success)
        return reply(
          {
            error:
              parsed.error.issues[0]?.message ?? "Check your notes and review.",
          },
          400,
        );
      const { id, confirm_review, ...input } = parsed.data;
      const existing = await repository.find(id);
      if (!existing) return reply({ error: "Group not found." }, 404);
      if (
        input.review_status === "reviewed" &&
        !confirm_review &&
        (existing.review_status !== "reviewed" ||
          input.rule_evidence !== existing.rule_evidence)
      )
        return reply(
          { error: "Confirm that you personally reviewed these rules today." },
          400,
        );
      const lastReviewed =
        input.review_status === "reviewed"
          ? confirm_review
            ? new Date().toISOString()
            : existing.last_reviewed_at
          : null;
      const group = await repository.update(id, {
        ...input,
        last_reviewed_at: lastReviewed,
      });
      return group
        ? reply({ group })
        : reply({ error: "Group not found." }, 404);
    }
    const parsed = deleteGroupSchema.safeParse(body);
    if (!parsed.success) return reply({ error: "Choose a saved group." }, 400);
    return (await repository.remove(parsed.data.id))
      ? reply({ removed: true })
      : reply({ error: "Group not found." }, 404);
  } catch {
    return reply(
      {
        error:
          "Saved groups are unavailable. Retry, or ask your administrator to complete database setup.",
      },
      503,
    );
  }
}
export const GET = (request: Request) => handle(request, "GET");
export const POST = (request: Request) => handle(request, "POST");
export const PATCH = (request: Request) => handle(request, "PATCH");
export const DELETE = (request: Request) => handle(request, "DELETE");
