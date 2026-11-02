import { suiteFetch } from "@staysuite/ui";
import {
  automationSnapshotSchema,
  automationReplySchema,
  automationPreparedReplySchema,
  type AutomationCommand,
  type AutomationPrepare,
} from "@staysuite/validation";
async function request(
  path: string,
  viewer: string | undefined,
  body?: unknown,
  signal?: AbortSignal,
) {
  const response = await suiteFetch(`/api/automation-flows${path}`, {
    method: body ? "POST" : "GET",
    cache: "no-store",
    credentials: "same-origin",
    signal: signal ?? null,
    headers: {
      ...(viewer ? { "x-staysuite-viewer": viewer } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      typeof result === "object" && result && "error" in result
        ? String(result.error)
        : "Automation could not be loaded.",
    );
  return result;
}
export async function readFlows(
  viewer?: string,
  id?: string,
  history = false,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams();
  if (id) query.set("id", id);
  if (history) query.set("history", "true");
  const result = automationSnapshotSchema.parse(
    await request(query.size ? `?${query}` : "", viewer, undefined, signal),
  );
  if (viewer && result.viewer_id !== viewer)
    throw new Error("Your account changed. Reload Automations.");
  return result;
}
export async function flowCommand(input: AutomationCommand, viewer: string) {
  const result = automationReplySchema.parse(await request("", viewer, input));
  if (result.flow && result.flow.user_id !== viewer)
    throw new Error("Your account changed. Reload Automations.");
  return result;
}
export async function prepareFlowPost(
  input: AutomationPrepare,
  viewer: string,
) {
  const result = automationPreparedReplySchema.parse(
    await request("/prepare", viewer, input),
  );
  if (result.viewer_id !== viewer || result.job.user_id !== viewer)
    throw new Error("Your account changed. Reload Automations.");
  return result;
}
