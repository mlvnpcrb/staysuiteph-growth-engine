import { z } from "zod";
export const cadenceSchema = z
  .object({
    frequency: z.enum(["once", "daily", "weekly", "monthly"]),
    starts_at: z.iso.datetime({ offset: true }),
    interval: z.number().int().min(1).max(365).default(1),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    month_days: z.array(z.number().int().min(1).max(31)).max(31).default([]),
    ends_at: z.iso.datetime({ offset: true }).nullable().default(null),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.ends_at &&
      Date.parse(value.ends_at) < Date.parse(value.starts_at)
    )
      ctx.addIssue({
        code: "custom",
        message: "End date must follow the start date.",
      });
    if (
      new Set(value.weekdays).size !== value.weekdays.length ||
      new Set(value.month_days).size !== value.month_days.length
    )
      ctx.addIssue({ code: "custom", message: "Select each day once." });
    if (
      value.frequency === "weekly"
        ? value.weekdays.length === 0
        : value.weekdays.length !== 0
    )
      ctx.addIssue({
        code: "custom",
        message: "Choose weekdays for a weekly schedule only.",
      });
    if (
      value.frequency === "monthly"
        ? value.month_days.length === 0
        : value.month_days.length !== 0
    )
      ctx.addIssue({
        code: "custom",
        message: "Choose calendar days for a monthly schedule only.",
      });
    if (value.frequency === "once" && value.interval !== 1)
      ctx.addIssue({
        code: "custom",
        message: "A one-time schedule cannot repeat.",
      });
  });
export type ScheduleCadence = z.infer<typeof cadenceSchema>;
const dayMs = 86400000,
  offset = 8 * 3600000;
/** Manila civil-time recurrence; boundaries are exclusive and invalid month days are skipped. */
export function nextScheduleOccurrence(
  input: ScheduleCadence,
  after: string | number,
): string | null {
  const c = cadenceSchema.parse(input),
    anchor = Date.parse(c.starts_at),
    cut = typeof after === "number" ? after : Date.parse(after);
  if (!Number.isFinite(cut))
    throw new Error("Choose a valid calendar boundary.");
  const end = c.ends_at ? Date.parse(c.ends_at) : Infinity;
  const accept = (at: number) =>
    at >= anchor && at > cut && at <= end ? new Date(at).toISOString() : null;
  if (c.frequency === "once") return accept(anchor);
  const local = new Date(anchor + offset),
    day = Math.floor((anchor + offset) / dayMs) * dayMs,
    time = anchor + offset - day;
  const boundary = Math.max(cut, anchor - 1),
    localCut = new Date(boundary + offset);
  if (c.frequency === "daily") {
    const n = Math.max(
      0,
      Math.floor((boundary - anchor) / (dayMs * c.interval)) + 1,
    );
    return accept(anchor + n * dayMs * c.interval);
  }
  if (c.frequency === "weekly") {
    const week = day - local.getUTCDay() * dayMs,
      period = c.interval * 7 * dayMs;
    const n = Math.max(0, Math.floor((boundary + offset - week) / period));
    for (let cycle = n; cycle <= n + 1; cycle++)
      for (const weekday of [...c.weekdays].sort((a, b) => a - b)) {
        const result = accept(
          week + cycle * period + weekday * dayMs + time - offset,
        );
        if (result) return result;
      }
    return null;
  }
  const month = local.getUTCFullYear() * 12 + local.getUTCMonth(),
    cutMonth = localCut.getUTCFullYear() * 12 + localCut.getUTCMonth(),
    n = Math.max(0, Math.floor((cutMonth - month) / c.interval));
  for (let cycle = n; cycle <= n + 12; cycle++) {
    const m = month + cycle * c.interval,
      year = Math.floor(m / 12),
      index = m % 12;
    for (const date of [...c.month_days].sort((a, b) => a - b)) {
      const candidate = new Date(Date.UTC(year, index, date));
      if (candidate.getUTCMonth() !== index) continue;
      const result = accept(candidate.getTime() + time - offset);
      if (result) return result;
    }
  }
  return null;
}
export function projectSchedule(
  cadence: ScheduleCadence,
  from: string,
  to: string,
  cap = 100,
): string[] {
  const start = Date.parse(from),
    end = Date.parse(to);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    end - start > 366 * dayMs ||
    !Number.isInteger(cap) ||
    cap < 1 ||
    cap > 400
  )
    throw new Error("Choose a calendar range of up to one year.");
  const result: string[] = [];
  let cursor = start - 1;
  while (result.length < cap) {
    const next = nextScheduleOccurrence(cadence, cursor);
    if (!next || Date.parse(next) >= end) break;
    result.push(next);
    cursor = Date.parse(next);
  }
  return result;
}
export const scheduleSchema = z.object({
  automation_flow_id: z.uuid().nullable().optional(),
  id: z.uuid(),
  user_id: z.uuid(),
  campaign_id: z.uuid(),
  cadence: cadenceSchema,
  state: z.enum(["paused", "enabled", "blocked", "completed"]),
  revision: z.number().int().positive(),
  approved_digest: z.string().nullable(),
  next_run_at: z.string().nullable(),
  current_run_id: z.uuid().nullable(),
  stop_reason: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type CampaignSchedule = z.infer<typeof scheduleSchema>;
export const scheduleCommandSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("create"),
      campaign_id: z.uuid(),
      revision: z.number().int().positive(),
      cadence: cadenceSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal("update"),
      id: z.uuid(),
      revision: z.number().int().positive(),
      cadence: cadenceSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal("enable"),
      id: z.uuid(),
      revision: z.number().int().positive(),
      reviewed: z.literal(true),
    })
    .strict(),
  z
    .object({
      operation: z.literal("pause"),
      id: z.uuid(),
      revision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("delete"),
      id: z.uuid(),
      revision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("tick"),
      actor_id: z.string().regex(/^[1-9][0-9]{0,79}$/),
      actor_type: z.enum(["personal", "page"]),
    })
    .strict(),
]);
export const scheduleListSchema = z.object({
  viewer_id: z.uuid(),
  schedules: z.array(scheduleSchema),
  runs: z.array(
    z.object({
      id: z.uuid(),
      schedule_id: z.uuid().nullable(),
      campaign_id: z.uuid().nullable(),
      user_id: z.uuid(),
      scheduled_at: z.string(),
      started_at: z.string().nullable(),
      finished_at: z.string().nullable(),
      state: z.enum(["running", "completed", "blocked", "cancelled", "missed"]),
      outcomes: z.array(z.unknown()),
    }),
  ),
});
export const scheduleTickReplySchema = z.object({
  viewer_id: z.uuid(),
  result: z.object({ campaign_ids: z.array(z.uuid()).max(200) }),
});

export const scheduleConnectionSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    origin: z.url(),
    viewer: z.uuid(),
    actorId: z.string().regex(/^[1-9][0-9]{0,79}$/),
    generation: z.uuid(),
  })
  .strict();

export type ScheduleConnection = z.infer<typeof scheduleConnectionSchema>;
