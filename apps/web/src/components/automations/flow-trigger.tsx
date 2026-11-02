"use client";
import { useState } from "react";
import { cadenceSchema, type ScheduleCadence } from "@staysuite/validation";
import { manilaLocal, manilaUtc } from "./schedule-api";
type Draft = {
  frequency: "immediate" | ScheduleCadence["frequency"];
  starts: string;
  ends: string;
  interval: number;
  weekdays: number[];
  month_days: number[];
};
export function FlowTrigger({
  initial,
  onChange,
}: {
  initial: ScheduleCadence | null;
  onChange: (cadence: ScheduleCadence | null | undefined) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => ({
    frequency: initial?.frequency ?? "immediate",
    starts: manilaLocal(
      initial?.starts_at ?? new Date(Date.now() + 3600000).toISOString(),
    ),
    ends: initial?.ends_at ? manilaLocal(initial.ends_at) : "",
    interval: initial?.interval ?? 1,
    weekdays: initial?.weekdays ?? [],
    month_days: initial?.month_days ?? [],
  }));
  function update(patch: Partial<Draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (next.frequency === "immediate") {
      onChange(null);
      return;
    }
    try {
      onChange(
        cadenceSchema.parse({
          frequency: next.frequency,
          starts_at: manilaUtc(next.starts),
          ends_at: next.ends ? manilaUtc(next.ends) : null,
          interval: next.frequency === "once" ? 1 : next.interval,
          weekdays:
            next.frequency === "weekly"
              ? [...next.weekdays].sort((a, b) => a - b)
              : [],
          month_days:
            next.frequency === "monthly"
              ? [...next.month_days].sort((a, b) => a - b)
              : [],
        }),
      );
    } catch {
      onChange(undefined);
    }
  }
  return (
    <div className="flow-trigger">
      <label>
        Start
        <select
          aria-label="Trigger frequency"
          value={draft.frequency}
          onChange={(e) => {
            const parsed = cadenceSchema.shape.frequency.safeParse(
              e.target.value,
            );
            update({ frequency: parsed.success ? parsed.data : "immediate" });
          }}
        >
          {["immediate", "once", "daily", "weekly", "monthly"].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      {draft.frequency !== "immediate" && (
        <>
          <label>
            Start date and time
            <input
              aria-label="Trigger start"
              type="datetime-local"
              required
              value={draft.starts}
              onChange={(e) => update({ starts: e.target.value })}
            />
          </label>
          <p>Asia/Manila (UTC+08:00)</p>
          {draft.frequency !== "once" && (
            <label>
              Repeat every
              <input
                aria-label="Trigger interval"
                type="number"
                min={1}
                max={365}
                value={Number.isFinite(draft.interval) ? draft.interval : ""}
                onChange={(e) => update({ interval: e.target.valueAsNumber })}
              />
            </label>
          )}
          {draft.frequency === "weekly" && (
            <fieldset className="schedule-day-picker">
              <legend>Days of week</legend>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                (day, index) => (
                  <label key={day}>
                    <input
                      type="checkbox"
                      checked={draft.weekdays.includes(index)}
                      onChange={(e) =>
                        update({
                          weekdays: e.target.checked
                            ? [...draft.weekdays, index]
                            : draft.weekdays.filter((v) => v !== index),
                        })
                      }
                    />
                    {day}
                  </label>
                ),
              )}
            </fieldset>
          )}
          {draft.frequency === "monthly" && (
            <fieldset className="schedule-day-picker">
              <legend>Days of month</legend>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                <label key={day}>
                  <input
                    type="checkbox"
                    checked={draft.month_days.includes(day)}
                    onChange={(e) =>
                      update({
                        month_days: e.target.checked
                          ? [...draft.month_days, day]
                          : draft.month_days.filter((v) => v !== day),
                      })
                    }
                  />
                  {day}
                </label>
              ))}
            </fieldset>
          )}
          <label>
            End date and time
            <input
              aria-label="Trigger end"
              type="datetime-local"
              value={draft.ends}
              onChange={(e) => update({ ends: e.target.value })}
            />
          </label>
        </>
      )}
    </div>
  );
}
