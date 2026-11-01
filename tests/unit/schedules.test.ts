import { expect, it } from "vitest";
import {
  cadenceSchema,
  nextScheduleOccurrence,
  projectSchedule,
} from "../../packages/validation/src/schedules";
const cadence = (extra: object = {}) =>
  cadenceSchema.parse({
    frequency: "daily",
    starts_at: "2026-11-01T00:00:00Z",
    interval: 1,
    weekdays: [],
    month_days: [],
    ends_at: null,
    ...extra,
  });
it("uses Manila wall time through year and midnight boundaries", () => {
  expect(
    nextScheduleOccurrence(
      cadence({ starts_at: "2026-12-31T16:30:00Z" }),
      "2026-12-31T16:30:00Z",
    ),
  ).toBe("2027-01-01T16:30:00.000Z");
  expect(nextScheduleOccurrence(cadence(), "2026-10-01T00:00:00Z")).toBe(
    "2026-11-01T00:00:00.000Z",
  );
});
it("anchors weekly intervals and uses Sunday-zero weekdays", () => {
  const c = cadence({ frequency: "weekly", weekdays: [1, 5], interval: 2 });
  expect(
    projectSchedule(c, "2026-11-01T00:00:00Z", "2026-11-22T00:00:00Z"),
  ).toEqual([
    "2026-11-02T00:00:00.000Z",
    "2026-11-06T00:00:00.000Z",
    "2026-11-16T00:00:00.000Z",
    "2026-11-20T00:00:00.000Z",
  ]);
});
it("skips invalid month days and preserves leap-day recurrence", () => {
  const c = cadence({
    frequency: "monthly",
    starts_at: "2028-01-31T01:00:00Z",
    month_days: [29, 31],
  });
  expect(
    projectSchedule(c, "2028-01-31T01:00:00Z", "2028-04-01T00:00:00Z"),
  ).toEqual([
    "2028-01-31T01:00:00.000Z",
    "2028-02-29T01:00:00.000Z",
    "2028-03-29T01:00:00.000Z",
    "2028-03-31T01:00:00.000Z",
  ]);
});
it("has exclusive next boundaries, inclusive ends and no invented one-time repeats", () => {
  const c = cadence({ frequency: "once", ends_at: "2026-11-01T00:00:00Z" });
  expect(nextScheduleOccurrence(c, "2026-10-01T00:00:00Z")).toBe(
    "2026-11-01T00:00:00.000Z",
  );
  expect(nextScheduleOccurrence(c, c.starts_at)).toBeNull();
  expect(
    projectSchedule(c, "2026-11-01T00:00:00Z", "2026-11-02T00:00:00Z"),
  ).toHaveLength(1);
});
it.each([
  { frequency: "weekly", weekdays: [] },
  { frequency: "daily", weekdays: [1] },
  { frequency: "weekly", weekdays: [1, 1] },
  { frequency: "monthly", month_days: [0] },
  { frequency: "monthly", month_days: [] },
  { interval: 0 },
  { ends_at: "2026-10-01T00:00:00Z" },
  { frequency: "once", interval: 2 },
])("rejects incomplete or inconsistent cadence %#", (extra) => {
  expect(() => cadence(extra)).toThrow();
});
it("bounds projections and detects impossible monthly patterns", () => {
  expect(() =>
    projectSchedule(cadence(), "2026-01-01", "2028-01-01"),
  ).toThrow();
  expect(
    nextScheduleOccurrence(
      cadence({
        frequency: "monthly",
        starts_at: "2026-02-01T00:00:00Z",
        interval: 12,
        month_days: [31],
      }),
      "2026-01-01",
    ),
  ).toBeNull();
  expect(
    projectSchedule(cadence(), "2026-11-01", "2027-01-01", 3),
  ).toHaveLength(3);
});
