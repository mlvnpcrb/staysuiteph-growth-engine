import { scheduleRepository } from "@staysuite/database";
import {
  scheduleCommandSchema,
  scheduleListSchema,
  scheduleSchema,
} from "@staysuite/validation";
import { hasSameRequestOrigin } from "./request-origin";
import type { BackendServices } from "./services";
export function createSchedulesHandlers(services: BackendServices) {
  const reply = (body: unknown, status = 200) =>
    Response.json(body, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
  async function handle(request: Request, method: "GET" | "POST") {
    if (method === "POST" && !hasSameRequestOrigin(request))
      return reply({ error: "Request origin was not accepted." }, 403);
    if (!services.configured())
      return reply({ error: "Schedule storage is not connected." }, 503);
    try {
      const client = await services.client();
      const {
        data: { user },
        error,
      } = await client.auth.getUser();
      if (error || !user || user.is_anonymous)
        return reply({ error: "Sign in to manage schedules." }, 401);
      const viewer = request.headers.get("x-staysuite-viewer");
      if (viewer && viewer !== user.id)
        return reply(
          { error: "Your account changed. Reload before continuing." },
          409,
        );
      const repo = scheduleRepository(client, user.id);
      if (method === "GET") {
        const filter = new URL(request.url).searchParams.get("campaign_id");
        if (
          filter &&
          !scheduleSchema.shape.campaign_id.safeParse(filter).success
        )
          return reply({ error: "Choose a valid campaign." }, 400);
        const [schedules, runs] = await Promise.all([
          repo.list(filter ?? undefined),
          repo.runs(),
        ]);
        return reply(
          scheduleListSchema.parse({ schedules, runs, viewer_id: user.id }),
        );
      }
      const raw = await request.text();
      if (raw.length > 10000)
        return reply({ error: "Schedule command is too large." }, 413);
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return reply({ error: "Enter a valid schedule command." }, 400);
      }
      const parsed = scheduleCommandSchema.safeParse(body);
      if (!parsed.success)
        return reply(
          { error: parsed.error.issues[0]?.message ?? "Check the schedule." },
          400,
        );
      const input = parsed.data;
      if (input.operation === "tick") {
        const result = await repo.command(
          "00000000-0000-4000-8000-000000000000",
          0,
          "tick",
          { actor_id: input.actor_id, actor_type: input.actor_type },
        );
        return reply({ result, viewer_id: user.id });
      }
      const id = input.operation === "create" ? crypto.randomUUID() : input.id;
      const payload =
        input.operation === "create"
          ? { campaign_id: input.campaign_id, cadence: input.cadence }
          : input.operation === "update"
            ? { cadence: input.cadence }
            : input.operation === "enable"
              ? { reviewed: true }
              : {};
      const result = await repo.command(
        id,
        input.revision,
        input.operation,
        payload,
      );
      return reply(
        input.operation === "delete"
          ? { result, viewer_id: user.id }
          : { schedule: scheduleSchema.parse(result), viewer_id: user.id },
      );
    } catch (error) {
      const code =
        typeof error === "object" && error && "code" in error
          ? String(error.code)
          : "";
      if (code === "42501")
        return reply(
          { error: "This schedule is not available to your account." },
          403,
        );
      if (["PT409", "23505"].includes(code))
        return reply(
          { error: "The campaign or schedule changed. Reload before saving." },
          409,
        );
      if (code === "55000")
        return reply(
          {
            error:
              "Use validated Direct publishing, approve the exact campaign in the extension, and resolve its current run before continuing.",
          },
          409,
        );
      if (code === "22023")
        return reply(
          {
            error:
              "Check the recurrence, selected days, and future start/end dates.",
          },
          400,
        );
      return reply(
        {
          error:
            "Schedule storage could not complete this operation. Reload before retrying.",
        },
        503,
      );
    }
  }
  const GET = (request: Request) => handle(request, "GET");
  const POST = (request: Request) => handle(request, "POST");

  return { GET, POST };
}
