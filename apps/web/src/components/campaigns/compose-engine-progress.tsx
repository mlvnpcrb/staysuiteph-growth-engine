"use client";
import { useEffect, useState } from "react";
import { campaignRestoreSchema, type CampaignJob } from "@staysuite/validation";
import { campaignCommand } from "./campaign-api";
export function ComposeEngineProgress({
  id,
  viewer,
  onChange,
}: {
  id: string;
  viewer: string;
  onChange?: (job: CampaignJob) => void;
}) {
  const [job, setJob] = useState<CampaignJob | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    setJob(null);
    const read = async () => {
      try {
        const response = await fetch(`/api/campaigns?id=${id}&view=progress`, {
          cache: "no-store",
          signal: controller.signal,
          headers: { "x-staysuite-viewer": viewer },
        });
        if (!response.ok)
          throw new Error(
            response.status === 409
              ? "Your account changed. Reconnect the engine."
              : "Posting progress could not be loaded. Check the engine before retrying.",
          );
        const result = campaignRestoreSchema.parse(await response.json());
        if (result.viewer_id !== viewer || result.job.user_id !== viewer)
          throw new Error("Your account changed. Reconnect the engine.");
        if (!active) return;
        setJob(result.job);
        setError("");
        onChange?.(result.job);
        if (!["completed", "cancelled", "blocked"].includes(result.job.state))
          timer = setTimeout(() => void read(), 3000);
      } catch (error) {
        if (active) {
          setError(
            error instanceof Error ? error.message : "Progress unavailable.",
          );
          setJob(null);
        }
      }
    };
    void read();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, viewer, version, onChange]);
  async function pause() {
    if (!job) return;
    setBusy(true);
    try {
      const result = await campaignCommand(
        { id: job.id, revision: job.revision, command: "pause", payload: {} },
        viewer,
      );
      setJob(result.job);
      setVersion((v) => v + 1);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Pause was not confirmed. Check the engine.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="compose-engine-progress"
      aria-labelledby="compose-engine-progress-title"
    >
      <header>
        <h3 id="compose-engine-progress-title">Posting engine</h3>
        <button
          type="button"
          className="gpp-secondary"
          onClick={() => setVersion((v) => v + 1)}
        >
          Refresh progress
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      {job ? (
        <>
          <p role="status">
            {job.state} ·{" "}
            {
              job.targets.filter((target) =>
                ["live", "pending_admin"].includes(target.state),
              ).length
            }{" "}
            of {job.targets.length} submissions confirmed
          </p>
          <ol>
            {job.targets.map((target) => (
              <li key={target.id}>
                <span>Group {target.position + 1}</span>
                <strong>{target.state.replaceAll("_", " ")}</strong>
                {target.post_url && (
                  <a
                    href={target.post_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View post
                  </a>
                )}
              </li>
            ))}
          </ol>
          {job.stop_reason && <p>{job.stop_reason}</p>}
          <button
            type="button"
            className="gpp-secondary"
            disabled={busy || job.state !== "running"}
            onClick={() => void pause()}
          >
            Pause posting
          </button>
          <p>
            “Pending admin” means submitted for group approval. A paused run may
            still receive the result of a submission already in flight.
          </p>
        </>
      ) : (
        !error && <p role="status">Loading saved posting status…</p>
      )}
    </section>
  );
}
