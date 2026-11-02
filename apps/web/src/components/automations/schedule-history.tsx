"use client";
import { suiteFetch } from "@staysuite/ui";
import { useEffect, useState } from "react";
import { scheduleListSchema, campaignJobSchema } from "@staysuite/validation";
import { csvCell } from "../../lib/activity-export";
type Runs = ReturnType<typeof scheduleListSchema.parse>["runs"];
function outcomes(run: Runs[number]) {
  return run.outcomes.flatMap((value) => {
    const parsed = campaignJobSchema.shape.targets.element.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
}
export function ScheduleHistory({ search }: { search: string }) {
  const [runs, setRuns] = useState<Runs | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void suiteFetch("/api/schedules", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Scheduled run history could not be loaded.");
        const body = scheduleListSchema.parse(await response.json());
        if (!controller.signal.aborted) setRuns(body.runs);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Scheduled run history could not be loaded.");
      });
    return () => controller.abort();
  }, []);
  const visible = runs?.filter((run) =>
    `${run.id} ${run.campaign_id ?? ""} ${run.state} ${run.scheduled_at} ${outcomes(
      run,
    )
      .map(
        (target) =>
          `${target.group_id} ${target.state} ${target.post_url ?? ""}`,
      )
      .join(" ")}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  function download() {
    const rows = [
      [
        "Run ID",
        "Scheduled at (UTC)",
        "Run status",
        "Group ID",
        "Outcome",
        "Post URL",
      ],
      ...(visible ?? []).flatMap((run) => {
        const targets = outcomes(run);
        return targets.length
          ? targets.map((target) => [
              run.id,
              run.scheduled_at,
              run.state,
              target.group_id,
              target.state,
              target.post_url ?? "",
            ])
          : [[run.id, run.scheduled_at, run.state, "", "", ""]];
      }),
    ];
    const blob = new Blob(
      [
        "\uFEFF" +
          rows.map((row) => row.map(csvCell).join(",")).join("\r\n") +
          "\r\n",
      ],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "staysuite-scheduled-runs.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (error) return <p role="alert">{error}</p>;
  if (!runs?.length) return null;
  return (
    <section className="panel schedule-history">
      <header>
        <h2>Scheduled runs</h2>
        <button
          type="button"
          className="gpp-secondary"
          disabled={!visible?.length}
          onClick={download}
        >
          Export scheduled runs
        </button>
      </header>
      <p className="muted">
        Latest 100 recorded runs. Run completion and individual publication
        outcomes are shown separately.
      </p>
      {visible?.map((run) => (
        <article key={run.id}>
          <h3>
            {new Date(run.scheduled_at).toLocaleString("en-PH", {
              timeZone: "Asia/Manila",
            })}{" "}
            · {run.state}
          </h3>
          <p>Run {run.id}</p>
          <details>
            <summary>Submission outcomes</summary>
            <ul>
              {outcomes(run).map((target) => (
                <li key={target.id}>
                  Group {target.position + 1}: {target.state}
                  {target.post_url &&
                    /^https:\/\/www\.facebook\.com\/groups\/[1-9][0-9]*\/posts\/[1-9][0-9]*\/?$/.test(
                      target.post_url,
                    ) && (
                      <>
                        {" "}
                        ·{" "}
                        <a
                          href={target.post_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View post
                        </a>
                      </>
                    )}
                </li>
              ))}
            </ul>
            {!run.outcomes.length && (
              <p>No submissions were recorded for this run.</p>
            )}
            {run.outcomes.length !== outcomes(run).length && (
              <p>Some outcome records could not be verified for display.</p>
            )}
          </details>
        </article>
      ))}
    </section>
  );
}
