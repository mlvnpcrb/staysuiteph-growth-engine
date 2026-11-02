import { suiteFetch } from "@staysuite/ui";
import {
  radarPageSchema,
  radarReplySchema,
  radarCommandSchema,
  type RadarCommand,
  type RadarQuery,
} from "@staysuite/validation";
export function radarQueryString(query: RadarQuery) {
  const params = new URLSearchParams({ scope: query.scope });
  if (query.search) params.set("search", query.search);
  if (query.status !== "all") params.set("status", query.status);
  if (query.stage) params.set("stage", query.stage);
  if (query.keyword) params.set("keyword", query.keyword);
  if (query.cursor) params.set("cursor", query.cursor);
  return params.toString();
}
async function accepted(response: Response) {
  const body: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      typeof body === "object" && body && "error" in body
        ? String(body.error)
        : "Lead Radar request failed.",
    );
  return body;
}
export async function readRadar(
  query: RadarQuery,
  viewer: string,
  signal: AbortSignal,
) {
  const data = radarPageSchema.parse(
    await accepted(
      await suiteFetch(`/api/radar?${radarQueryString(query)}`, {
        cache: "no-store",
        signal,
        headers: { "x-staysuite-viewer": viewer },
      }),
    ),
  );
  if (data.viewer_id !== viewer || data.scope !== query.scope)
    throw new Error("Your profile or account changed. Reconnect Lead Radar.");
  return data;
}
export async function radarCommand(input: RadarCommand, viewer: string) {
  const data = radarReplySchema.parse(
    await accepted(
      await suiteFetch("/api/radar", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-staysuite-viewer": viewer,
        },
        body: JSON.stringify(radarCommandSchema.parse(input)),
      }),
    ),
  );
  if (
    (data.settings &&
      (data.settings.user_id !== viewer ||
        data.settings.scope !== input.scope)) ||
    (data.lead &&
      (data.lead.user_id !== viewer || data.lead.scope !== input.scope))
  )
    throw new Error("Your profile or account changed. Reconnect Lead Radar.");
  return data;
}
