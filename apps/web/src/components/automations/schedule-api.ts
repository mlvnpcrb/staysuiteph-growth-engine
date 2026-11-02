import { suiteFetch } from "@staysuite/ui";
import { scheduleSchema, type CampaignSchedule } from "@staysuite/validation";
export function manilaLocal(value: string) {
  return new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 16);
}
export function manilaUtc(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Choose a date and time.");
  const parsed = new Date(`${value}:00+08:00`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    manilaLocal(parsed.toISOString()) !== value
  )
    throw new Error("Choose a valid Manila date and time.");
  return parsed.toISOString();
}
export async function scheduleCommand(
  body: unknown,
  viewer: string,
): Promise<CampaignSchedule | null> {
  const response = await suiteFetch("/api/schedules", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-staysuite-viewer": viewer,
    },
    body: JSON.stringify(body),
  });
  const result: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      typeof result === "object" && result && "error" in result
        ? String(result.error)
        : "Schedule could not be saved.",
    );
  if (
    typeof result !== "object" ||
    !result ||
    !("viewer_id" in result) ||
    result.viewer_id !== viewer
  )
    throw new Error("Your account changed. Reload.");
  return "schedule" in result ? scheduleSchema.parse(result.schedule) : null;
}
