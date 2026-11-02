"use client";
import { suiteFetch } from "@staysuite/ui";
import { useEffect, useState } from "react";
import {
  cadenceSchema,
  scheduleListSchema,
  projectSchedule,
  nextScheduleOccurrence,
  type CampaignSchedule,
  type ScheduleCadence,
} from "@staysuite/validation";
import { manilaLocal, manilaUtc, scheduleCommand } from "./schedule-api";
const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function ScheduleEditor({
  campaignId,
  campaignRevision,
  onSaved,
}: {
  campaignId: string;
  campaignRevision: number;
  onSaved: (value: CampaignSchedule) => void;
}) {
  const [stored, setStored] = useState<CampaignSchedule | null>(null),
    [viewer, setViewer] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [frequency, setFrequency] =
      useState<ScheduleCadence["frequency"]>("once"),
    [starts, setStarts] = useState(
      manilaLocal(new Date(Date.now() + 3600000).toISOString()),
    ),
    [ends, setEnds] = useState(""),
    [interval, setInterval] = useState(1),
    [weekdays, setWeekdays] = useState<number[]>([]),
    [monthDays, setMonthDays] = useState<number[]>([]),
    [reviewed, setReviewed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setStored(null);
    setReviewed(false);
    void suiteFetch(
      `/api/schedules?campaign_id=${encodeURIComponent(campaignId)}`,
      {
        cache: "no-store",
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok)
          throw new Error(
            typeof body === "object" && body && "error" in body
              ? String(body.error)
              : "Schedule could not be loaded.",
          );
        const result = scheduleListSchema.parse(body);
        if (controller.signal.aborted) return;
        setViewer(result.viewer_id);
        const current = result.schedules[0];
        if (current) {
          setStored(current);
          setFrequency(current.cadence.frequency);
          setStarts(manilaLocal(current.cadence.starts_at));
          setEnds(
            current.cadence.ends_at ? manilaLocal(current.cadence.ends_at) : "",
          );
          setInterval(current.cadence.interval);
          setWeekdays(current.cadence.weekdays);
          setMonthDays(current.cadence.month_days);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "Schedule could not be loaded.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [campaignId]);
  let cadence: ScheduleCadence | null = null;
  try {
    cadence = cadenceSchema.parse({
      frequency,
      starts_at: manilaUtc(starts),
      ends_at: ends ? manilaUtc(ends) : null,
      interval: frequency === "once" ? 1 : interval,
      weekdays:
        frequency === "weekly" ? [...weekdays].sort((a, b) => a - b) : [],
      month_days:
        frequency === "monthly" ? [...monthDays].sort((a, b) => a - b) : [],
    });
  } catch {
    /* The form remains editable until its cadence is complete. */
  }
  const dirty =
    !!stored &&
    JSON.stringify(cadence) !==
      JSON.stringify(cadenceSchema.parse(stored.cadence));
  let preview: string[] = [];
  if (cadence) {
    try {
      const next = nextScheduleOccurrence(cadence, Date.now());
      if (next)
        preview = projectSchedule(
          cadence,
          next,
          new Date(Date.parse(next) + 365 * 86400000).toISOString(),
          5,
        );
    } catch {
      /* Invalid/incomplete dates have no preview. */
    }
  }
  async function mutate(operation: "save" | "enable" | "pause") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (operation === "save" && !cadence)
        throw new Error(
          "Check the dates, recurrence interval and selected days.",
        );
      const input =
        operation === "save"
          ? stored
            ? {
                operation: "update",
                id: stored.id,
                revision: stored.revision,
                cadence,
              }
            : {
                operation: "create",
                campaign_id: campaignId,
                revision: campaignRevision,
                cadence,
              }
          : {
              operation,
              id: stored!.id,
              revision: stored!.revision,
              ...(operation === "enable" ? { reviewed: true } : {}),
            };
      const result = await scheduleCommand(input, viewer);
      if (!result) throw new Error("Schedule was not returned.");
      setStored(result);
      setReviewed(false);
      onSaved(result);
      setMessage(
        operation === "save"
          ? "Schedule saved and paused. Review it before enabling."
          : operation === "enable"
            ? "Schedule enabled. Your connected extension handles due runs."
            : "Schedule paused.",
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Schedule operation failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="schedule-editor"
      onSubmit={(event) => {
        event.preventDefault();
        void mutate("save");
      }}
    >
      {loading && <p role="status">Loading schedule…</p>}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <fieldset disabled={busy || loading}>
        <label>
          Repeat
          <select
            aria-label="Repeat"
            value={frequency}
            onChange={(event) => {
              setFrequency(event.target.value as ScheduleCadence["frequency"]);
              setReviewed(false);
            }}
          >
            <option value="once">Once</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <label>
          Start date and time
          <input
            type="datetime-local"
            required
            value={starts}
            onChange={(event) => {
              setStarts(event.target.value);
              setReviewed(false);
            }}
          />
        </label>
        <p className="muted">Asia/Manila (UTC+08:00)</p>
        {frequency !== "once" && (
          <label>
            Repeat every
            <input
              type="number"
              min={1}
              max={365}
              required
              value={Number.isFinite(interval) ? interval : ""}
              onChange={(event) => {
                setInterval(
                  event.target.value ? Number(event.target.value) : NaN,
                );
                setReviewed(false);
              }}
            />
            {frequency === "daily"
              ? "days"
              : frequency === "weekly"
                ? "weeks"
                : "months"}
          </label>
        )}
        {frequency === "weekly" && (
          <fieldset className="schedule-day-picker">
            <legend>Days of week</legend>
            {days.map((day, index) => (
              <label key={day}>
                <input
                  type="checkbox"
                  checked={weekdays.includes(index)}
                  onChange={(event) => {
                    setWeekdays((items) =>
                      event.target.checked
                        ? [...items, index]
                        : items.filter((item) => item !== index),
                    );
                    setReviewed(false);
                  }}
                />
                {day}
              </label>
            ))}
          </fieldset>
        )}
        {frequency === "monthly" && (
          <fieldset className="schedule-day-picker">
            <legend>Days of month</legend>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <label key={day}>
                <input
                  type="checkbox"
                  checked={monthDays.includes(day)}
                  onChange={(event) => {
                    setMonthDays((items) =>
                      event.target.checked
                        ? [...items, day]
                        : items.filter((item) => item !== day),
                    );
                    setReviewed(false);
                  }}
                />
                {day}
              </label>
            ))}
            <p>Dates missing from a month are skipped.</p>
          </fieldset>
        )}
        <label>
          End date and time (optional)
          <input
            type="datetime-local"
            value={ends}
            onChange={(event) => {
              setEnds(event.target.value);
              setReviewed(false);
            }}
          />
        </label>
        <button
          type="submit"
          className="gpp-secondary"
          disabled={
            !viewer || !cadence || !preview.length || !!stored?.current_run_id
          }
        >
          Save schedule
        </button>
      </fieldset>
      <section className="schedule-preview">
        <h3>Next occurrences</h3>
        <p className="muted">
          Preview of the saved timing. Paused schedules do not run.
        </p>
        <ol>
          {preview.map((at) => (
            <li key={at}>
              {new Date(at).toLocaleString("en-PH", {
                timeZone: "Asia/Manila",
              })}
            </li>
          ))}
        </ol>
        {!preview.length && (
          <p>Choose a future date and complete the recurrence.</p>
        )}
      </section>
      {stored && (
        <section className="schedule-enable">
          <p>
            Status: <strong>{stored.state}</strong>
            {stored.stop_reason ? ` · ${stored.stop_reason}` : ""}
          </p>
          <p>
            Requires StaySuite extension 0.5.0+ with background checks armed.
            Approve the exact campaign in your extension first. Changing
            content, group rules or timing requires review again. Missed runs
            older than 15 minutes are skipped.
          </p>
          <label>
            <input
              type="checkbox"
              checked={reviewed}
              disabled={busy || dirty}
              onChange={(event) => setReviewed(event.target.checked)}
            />
            I reviewed this exact campaign, its groups and recurrence.
          </label>
          <button
            type="button"
            className="gpp-secondary"
            disabled={busy || !reviewed || dirty || stored.state === "enabled"}
            onClick={() => void mutate("enable")}
          >
            Enable schedule
          </button>
          <button
            type="button"
            className="gpp-secondary"
            disabled={busy || stored.state !== "enabled"}
            onClick={() => void mutate("pause")}
          >
            Pause schedule
          </button>
          {dirty && <p>Save your timing changes before enabling.</p>}
        </section>
      )}
    </form>
  );
}
