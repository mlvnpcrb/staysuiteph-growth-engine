import { radarRepository } from "@staysuite/database";
import { radarQuerySchema, radarLeadSchema } from "@staysuite/validation";
import { csvCell } from "./activity-export";
import type { BackendServices } from "./services";
export function createRadarExportHandlers(services: BackendServices) {
  const failure = (error: string, status: number) =>
    Response.json(
      { error },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  async function GET(request: Request) {
    if (!services.configured())
      return failure("Lead Radar storage is not connected.", 503);
    try {
      const client = await services.client();
      const {
        data: { user },
        error,
      } = await client.auth.getUser();
      if (error || !user || user.is_anonymous)
        return failure("Sign in to export Lead Radar.", 401);
      const viewer = request.headers.get("x-staysuite-viewer");
      if (viewer && viewer !== user.id)
        return failure("Your account changed. Reload before exporting.", 409);
      const parsed = radarQuerySchema
        .omit({ cursor: true })
        .safeParse(Object.fromEntries(new URL(request.url).searchParams));
      if (!parsed.success)
        return failure("Choose a valid profile and export filter.", 400);
      const query = { ...parsed.data, cursor: undefined };
      const repo = radarRepository(client, user.id),
        before = new Date().toISOString();
      let rows = await repo.leads(query, undefined, before);
      const encoder = new TextEncoder();
      const line = (cells: unknown[]) =>
        encoder.encode(
          cells.map((value) => csvCell(String(value))).join(",") + "\r\n",
        );
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            controller.enqueue(encoder.encode("\uFEFF"));
            controller.enqueue(
              line([
                "Author",
                "Post text",
                "Group",
                "Post link",
                "Keywords",
                "Stage",
                "Read",
                "Starred",
                "Note",
                "Discovered at (UTC)",
                "Post created at (UTC)",
              ]),
            );
            for (let page = 0; page < 20; page++) {
              const leads = rows
                .slice(0, 100)
                .map((row) => radarLeadSchema.parse(row));
              for (const lead of leads) {
                if (request.signal.aborted) {
                  controller.error(new Error("Export cancelled."));
                  return;
                }
                controller.enqueue(
                  line([
                    lead.author,
                    lead.text,
                    lead.group_name,
                    lead.url,
                    lead.matched_keywords.join("; "),
                    lead.stage,
                    lead.is_read,
                    lead.is_starred,
                    lead.note,
                    lead.discovered_at,
                    lead.post_created_at ?? "",
                  ]),
                );
              }
              if (rows.length <= 100) {
                controller.close();
                return;
              }
              const last = leads.at(-1);
              if (!last) throw new Error("Invalid export page.");
              rows = await repo.leads(
                query,
                { at: last.discovered_at, id: last.id },
                before,
              );
            }
            throw new Error("Export capacity exceeded.");
          } catch {
            controller.error(
              new Error("Export interrupted. Reload before retrying."),
            );
          }
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="staysuite-leads.csv"',
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "X-StaySuite-Export-Consistency": "live-with-discovery-cutoff",
        },
      });
    } catch {
      return failure(
        "Lead Radar export could not start. Reload before retrying.",
        503,
      );
    }
  }

  return { GET };
}
