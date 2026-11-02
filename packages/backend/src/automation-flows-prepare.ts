import { automationFlowRepository } from "@staysuite/database";
import {
  automationPrepareSchema,
  automationPreparedReplySchema,
} from "@staysuite/validation";
import { hasSameRequestOrigin } from "./request-origin";
import type { BackendServices } from "./services";
export function createFlowPrepareHandlers(services: BackendServices) {
  const reply = (body: unknown, status = 200) =>
    Response.json(body, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
  async function POST(request: Request) {
    if (!hasSameRequestOrigin(request))
      return reply({ error: "Request origin was not accepted." }, 403);
    if (!services.configured())
      return reply({ error: "Automation storage is not connected." }, 503);
    try {
      const client = await services.client();
      const {
        data: { user },
        error,
      } = await client.auth.getUser();
      if (error || !user || user.is_anonymous)
        return reply({ error: "Sign in to prepare template posts." }, 401);
      const viewer = request.headers.get("x-staysuite-viewer");
      if (viewer && viewer !== user.id)
        return reply(
          { error: "Your account changed. Reload before continuing." },
          409,
        );
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > 64000)
        return reply({ error: "Template post request is too large." }, 413);
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return reply({ error: "Enter a valid template post request." }, 400);
      }
      const input = automationPrepareSchema.safeParse(body);
      if (!input.success)
        return reply(
          {
            error:
              input.error.issues[0]?.message ??
              "Check the template, groups and settings.",
          },
          400,
        );
      const result = automationPreparedReplySchema.parse(
        await automationFlowRepository(client).prepare(input.data),
      );
      if (
        result.viewer_id !== user.id ||
        result.job.user_id !== user.id ||
        result.prepared.campaign_id !== result.job.id
      )
        throw new Error("Prepared post owner mismatch");
      return reply(result);
    } catch (error) {
      const code =
        typeof error === "object" && error && "code" in error
          ? String(error.code)
          : "";
      if (code === "42501")
        return reply(
          { error: "This template or group is unavailable to your account." },
          403,
        );
      if (["PT409", "23505"].includes(code))
        return reply(
          {
            error:
              "The template or preparation request changed. Reload and prepare a new version.",
          },
          409,
        );
      if (code === "55000")
        return reply(
          {
            error:
              "Finish uploading the template and check that its private attachments are available.",
          },
          409,
        );
      if (["22023", "22P02", "23514", "23502"].includes(code))
        return reply(
          {
            error:
              "Check groups, timing and attachment limits. The current publisher needs post text up to 10,000 characters; media-only templates are unavailable.",
          },
          400,
        );
      return reply(
        {
          error:
            "Template preparation could not be completed. Reload before retrying.",
        },
        503,
      );
    }
  }

  return { POST };
}
