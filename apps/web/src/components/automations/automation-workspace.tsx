"use client";
import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  List,
  Clock,
  Plus,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  campaignListSchema,
  scheduleListSchema,
  projectSchedule,
  type CampaignList,
  type CampaignSchedule,
} from "@staysuite/validation";
import { CampaignBuilder } from "../campaigns/campaign-builder";
import { ScheduleEditor } from "./schedule-editor";
import { FlowWorkspace } from "./flow-workspace";
import { manilaUtc, scheduleCommand } from "./schedule-api";
type ScheduleData = ReturnType<typeof scheduleListSchema.parse>;
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function AutomationWorkspace() {
  const [data, setData] = useState<ScheduleData | null>(null),
    [campaigns, setCampaigns] = useState<CampaignList | null>(null),
    [view, setView] = useState("list"),
    [version, setVersion] = useState(0),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [selected, setSelected] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const [month, setMonth] = useState(() => {
    const local = new Date(Date.now() + 8 * 3600000);
    return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void Promise.all([
      fetch("/api/schedules", { cache: "no-store", signal: controller.signal }),
      fetch("/api/campaigns", { cache: "no-store", signal: controller.signal }),
    ])
      .then(async (responses) => {
        const [s, c] = await Promise.all(
          responses.map(async (response) => {
            const body: unknown = await response.json();
            if (!response.ok)
              throw new Error(
                typeof body === "object" && body && "error" in body
                  ? String(body.error)
                  : "Automations could not be loaded.",
              );
            return body;
          }),
        );
        const schedules = scheduleListSchema.parse(s),
          list = campaignListSchema.parse(c);
        if (schedules.viewer_id !== list.viewer_id)
          throw new Error("Your account changed. Reload Automations.");
        if (!controller.signal.aborted) {
          setData(schedules);
          setCampaigns(list);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setError(
            error instanceof Error
              ? error.message
              : "Automations could not be loaded.",
          );
          setData(null);
          setCampaigns(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [version]);
  const standaloneSchedules = (data?.schedules ?? []).filter(
    (schedule) => !schedule.automation_flow_id,
  );
  const campaign = (id: string) =>
    campaigns?.campaigns.find((item) => item.id === id);
  function edit(id: string) {
    setSelected(id);
    dialog.current?.showModal();
  }
  async function action(
    schedule: CampaignSchedule,
    operation: "pause" | "delete",
  ) {
    if (
      operation === "delete" &&
      !window.confirm(
        "Remove this schedule? Recorded run history will be kept.",
      )
    )
      return;
    try {
      await scheduleCommand(
        { operation, id: schedule.id, revision: schedule.revision },
        data!.viewer_id,
      );
      setVersion((value) => value + 1);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Schedule operation failed.",
      );
    }
  }
  const [yearNumber, monthNumber] = month.split("-").map(Number);
  const monthDate = new Date(Date.UTC(yearNumber!, monthNumber! - 1, 1));
  const gridStart = new Date(
    monthDate.getTime() - monthDate.getUTCDay() * 86400000,
  );
  const from = manilaUtc(`${gridStart.toISOString().slice(0, 10)}T00:00`),
    to = new Date(Date.parse(from) + 42 * 86400000).toISOString();
  const events: {
    id: string;
    at: string;
    title: string;
    state: string;
    campaignId: string | null;
  }[] = [];
  const now = Date.now();
  for (const schedule of standaloneSchedules) {
    if (schedule.state !== "enabled") continue;
    const dates =
      Date.parse(to) > now
        ? projectSchedule(
            schedule.cadence,
            new Date(Math.max(Date.parse(from), now)).toISOString(),
            to,
            100,
          )
        : [];
    for (const at of dates) {
      if (events.length >= 1000) break;
      events.push({
        id: `${schedule.id}:${at}`,
        at,
        title: campaign(schedule.campaign_id)?.title || "Saved campaign",
        state: "Planned",
        campaignId: schedule.campaign_id,
      });
    }
    if (
      !data?.runs.some((run) => run.id === schedule.current_run_id) &&
      schedule.next_run_at &&
      Date.parse(schedule.next_run_at) < now &&
      Date.parse(schedule.next_run_at) >= Date.parse(from) &&
      Date.parse(schedule.next_run_at) < Date.parse(to)
    ) {
      events.push({
        id: schedule.id,
        at: schedule.next_run_at,
        title: campaign(schedule.campaign_id)?.title || "Saved campaign",
        state: schedule.current_run_id ? "Running" : "Due",
        campaignId: schedule.campaign_id,
      });
    }
  }
  for (const run of data?.runs ?? [])
    if (
      Date.parse(run.scheduled_at) >= Date.parse(from) &&
      Date.parse(run.scheduled_at) < Date.parse(to)
    )
      events.push({
        id: run.id,
        at: run.scheduled_at,
        title: run.campaign_id
          ? campaign(run.campaign_id)?.title || "Saved campaign"
          : "Removed campaign",
        state: run.state,
        campaignId: run.campaign_id,
      });
  events.sort((a, b) => a.at.localeCompare(b.at));
  function changeMonth(delta: number) {
    const next = new Date(Date.UTC(yearNumber!, monthNumber! - 1 + delta, 1));
    setMonth(next.toISOString().slice(0, 7));
  }
  return (
    <div className="automation-workspace">
      <h1 className="sr-only">Automations</h1>
      <header className="automations-header">
        <div
          className="automation-view-switcher"
          role="group"
          aria-label="Automation view"
        >
          {[
            { value: "list", Icon: List, label: "List" },
            { value: "calendar", Icon: CalendarDays, label: "Calendar" },
            { value: "agenda", Icon: Clock, label: "Agenda" },
          ].map(({ value, Icon, label }) => (
            <button
              type="button"
              key={value}
              aria-pressed={view === value}
              aria-label={label}
              onClick={() => setView(value)}
            >
              <Icon size={16} aria-hidden="true" />
            </button>
          ))}
        </div>
        <span className="automation-count">
          {standaloneSchedules.length} schedules
        </span>
        <div className="automation-header-actions">
          <button
            type="button"
            className="gpp-secondary"
            disabled
            title="AI week planning is not implemented yet"
          >
            <Sparkles size={14} aria-hidden="true" />
            Plan my week
          </button>
          <button
            type="button"
            className="gpp-secondary"
            disabled
            title="AI Wizard is not implemented yet"
          >
            AI Wizard
          </button>
          <button
            type="button"
            className="gpp-secondary"
            disabled={loading || !campaigns}
            onClick={() => edit("")}
          >
            <Plus size={14} aria-hidden="true" />
            Create New
          </button>
        </div>
      </header>
      {loading && <p role="status">Loading automations…</p>}
      {error && <p role="alert">{error}</p>}
      <div className="automation-refresh">
        <button
          type="button"
          className="gpp-secondary"
          onClick={() => setVersion((value) => value + 1)}
        >
          Refresh automations
        </button>
        <span>
          Asia/Manila · Chrome and your connected extension must be available
          for dispatch.
        </span>
      </div>
      {data &&
        view === "list" &&
        (!standaloneSchedules.length ? (
          <section className="automation-empty">
            <CalendarDays size={36} aria-hidden="true" />
            <h2>Nothing running yet</h2>
            <p>
              An automation posts for you on a schedule. Set it up once and it
              keeps going.
            </p>
            <p>
              Saved schedules stay paused until you approve and enable them.
            </p>
            <button
              type="button"
              className="gpp-secondary"
              onClick={() => edit("")}
            >
              Build your first automation
            </button>
          </section>
        ) : (
          <div className="automation-list">
            {standaloneSchedules.map((schedule) => (
              <article key={schedule.id}>
                <div>
                  <h2>
                    {campaign(schedule.campaign_id)?.title || "Saved campaign"}
                  </h2>
                  <p>
                    {schedule.cadence.frequency} · {schedule.state}
                  </p>
                  <p>
                    Next run:{" "}
                    {schedule.next_run_at
                      ? new Date(schedule.next_run_at).toLocaleString("en-PH", {
                          timeZone: "Asia/Manila",
                        })
                      : "None"}
                  </p>
                  {schedule.stop_reason && <p>{schedule.stop_reason}</p>}
                </div>
                <div className="automation-card-actions">
                  <button
                    type="button"
                    className="gpp-secondary"
                    onClick={() => edit(schedule.campaign_id)}
                  >
                    Edit schedule
                  </button>
                  <button
                    type="button"
                    className="gpp-secondary"
                    disabled={schedule.state !== "enabled"}
                    onClick={() => void action(schedule, "pause")}
                  >
                    Pause
                  </button>
                  <button
                    type="button"
                    className="gpp-secondary"
                    disabled={!!schedule.current_run_id}
                    onClick={() => void action(schedule, "delete")}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        ))}
      {data && view !== "list" && (
        <section className="automation-calendar">
          <header>
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => changeMonth(-1)}
            >
              <ChevronLeft size={18} />
            </button>
            <h2>
              {monthDate.toLocaleDateString("en-PH", {
                timeZone: "UTC",
                month: "long",
                year: "numeric",
              })}
            </h2>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => changeMonth(1)}
            >
              <ChevronRight size={18} />
            </button>
          </header>
          {view === "calendar" ? (
            <div className="automation-calendar-scroll">
              <table>
                <caption className="sr-only">
                  Scheduled runs in Asia/Manila
                </caption>
                <thead>
                  <tr>
                    {weekdays.map((day) => (
                      <th key={day} scope="col">
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 6 }, (_, week) => (
                    <tr key={week}>
                      {Array.from({ length: 7 }, (_, weekday) => {
                        const date = new Date(
                            gridStart.getTime() +
                              (week * 7 + weekday) * 86400000,
                          ),
                          dateKey = date.toISOString().slice(0, 10);
                        return (
                          <td key={dateKey}>
                            <time dateTime={dateKey}>{date.getUTCDate()}</time>
                            {events
                              .filter(
                                (event) =>
                                  new Date(Date.parse(event.at) + 8 * 3600000)
                                    .toISOString()
                                    .slice(0, 10) === dateKey,
                              )
                              .map((event) => (
                                <button
                                  type="button"
                                  key={event.id}
                                  disabled={!event.campaignId}
                                  onClick={() =>
                                    event.campaignId && edit(event.campaignId)
                                  }
                                >
                                  <strong>
                                    {new Date(event.at).toLocaleTimeString(
                                      "en-PH",
                                      {
                                        timeZone: "Asia/Manila",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      },
                                    )}
                                  </strong>
                                  <span>{event.title}</span>
                                  <small>{event.state}</small>
                                </button>
                              ))}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ol className="automation-agenda">
              {events.map((event) => (
                <li key={event.id}>
                  <time dateTime={event.at}>
                    {new Date(event.at).toLocaleString("en-PH", {
                      timeZone: "Asia/Manila",
                    })}
                  </time>
                  <strong>{event.title}</strong>
                  <span>{event.state}</span>
                </li>
              ))}
            </ol>
          )}
          {!events.length && (
            <p>No enabled occurrences or recorded runs for this period.</p>
          )}
          <p className="muted">
            Future occurrences are plans, not publication receipts. Missed and
            completed entries come from recorded runs. Up to 1,000 occurrences
            are shown.
          </p>
        </section>
      )}
      <FlowWorkspace />
      <details className="automation-saved-campaigns">
        <summary>Saved campaigns</summary>
        <CampaignBuilder view="automations" showHeading={false} />
      </details>
      <dialog
        ref={dialog}
        className="reference-dialog schedule-dialog"
        aria-labelledby="schedule-dialog-title"
      >
        <header>
          <h2 id="schedule-dialog-title">Schedule Post</h2>
          <button
            type="button"
            aria-label="Close schedule"
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </header>
        <label>
          Campaign
          <select
            aria-label="Campaign"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            <option value="">Choose a saved campaign</option>
            {campaigns?.campaigns.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title || item.plan.text.slice(0, 50)}
              </option>
            ))}
          </select>
        </label>
        {selected && campaign(selected) ? (
          <ScheduleEditor
            key={selected}
            campaignId={selected}
            campaignRevision={campaign(selected)!.revision}
            onSaved={() => setVersion((value) => value + 1)}
          />
        ) : (
          <p>
            Save a post in Compose first, then choose it here.{" "}
            <a href="/dashboard/compose">Open Compose</a>
          </p>
        )}
      </dialog>
    </div>
  );
}
