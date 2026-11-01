import {
  scheduleTickReplySchema,
  type ScheduleConnection,
} from "@staysuite/validation";
export const SCHEDULE_CONNECTION = "staysuite-schedule-connection-v1";
export const SCHEDULE_STATUS = "staysuite-schedule-status-v1";
export {
  scheduleConnectionSchema,
  type ScheduleConnection,
} from "@staysuite/validation";
export async function scheduledWakeup(
  connection: ScheduleConnection,
  port: {
    actor: () => Promise<{ actor_id: string; actor_type: "personal" | "page" }>;
    tick: (actor: {
      actor_id: string;
      actor_type: "personal" | "page";
    }) => Promise<string[]>;
    stillArmed: () => Promise<boolean>;
    open: (id: string) => Promise<void>;
  },
) {
  const actor = await port.actor();
  if (actor.actor_id !== connection.actorId || actor.actor_type !== "personal")
    throw new Error("Facebook identity changed. Reconnect before scheduling.");
  const ids = scheduleTickReplySchema.shape.result.shape.campaign_ids.parse(
    await port.tick(actor),
  );
  if (!ids.length) return "idle";
  if (!(await port.stillArmed())) return "stopped";
  await port.open(ids[0]!);
  return "opened";
}
