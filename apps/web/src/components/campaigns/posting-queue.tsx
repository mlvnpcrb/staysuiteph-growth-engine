"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@staysuite/ui";
import type { CampaignJob, CampaignCommand } from "@staysuite/validation";
import { campaignListSchema, type CampaignList } from "@staysuite/validation";
import { activityCsv } from "@/lib/activity-export";
import { campaignCommand } from "./campaign-api";
export function PostingQueue() {
  const [activityView, setActivityView] = useState<"upcoming" | "history">(
    "upcoming",
  );
  const [search, setSearch] = useState("");
  const [list, setList] = useState<CampaignList | null>(null),
    [job, setJob] = useState<CampaignJob | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [reviewTarget, setReviewTarget] = useState(""),
    [reviewOutcome, setReviewOutcome] = useState("not_sent"),
    [postUrl, setPostUrl] = useState(""),
    [reviewed, setReviewed] = useState(false);
  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/campaigns", { cache: "no-store" });
      const body: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          typeof body === "object" && body && "error" in body
            ? String(body.error)
            : "Queue unavailable",
        );
      setList(campaignListSchema.parse(body));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Queue unavailable");
      setList(null);
      setJob(null);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function command(
    command: CampaignCommand["command"],
    id = job?.id,
    revision = job?.revision,
    payload: CampaignCommand["payload"] = {},
  ) {
    if (!id || revision === undefined || !list) return;
    setBusy(true);
    setError("");
    try {
      const result = await campaignCommand(
        { id, revision, command, payload },
        list.viewer_id,
      );
      setJob(result.job);
      setList(
        (current) =>
          current && {
            ...current,
            campaigns: current.campaigns.map((entry) =>
              entry.id === result.job.id
                ? {
                    ...entry,
                    state: result.job.state,
                    revision: result.job.revision,
                  }
                : entry,
            ),
          },
      );
      setReviewTarget("");
      setReviewed(false);
      setPostUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Queue operation failed");
    } finally {
      setBusy(false);
    }
  }
  const campaigns = list?.campaigns.filter(
    (campaign) =>
      (activityView === "history"
        ? ["completed", "cancelled"].includes(campaign.state)
        : !["completed", "cancelled"].includes(campaign.state)) &&
      `${campaign.title} ${campaign.plan.text} ${campaign.state}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  function exportActivity() {
    if (!campaigns?.length) return;
    const url = URL.createObjectURL(
      new Blob([activityCsv(campaigns)], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `staysuite-${activityView}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="page group-workspace">
      <div className="page-heading">
        <div>
          <h1>Activity</h1>
          <p className="muted">
            Saved campaigns and recorded submission outcomes.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/compose">Prepare campaign</Link>
        </Button>
      </div>
      <div
        className="reference-activity-switcher"
        role="group"
        aria-label="Activity view"
      >
        <Button
          variant={activityView === "upcoming" ? "default" : "ghost"}
          aria-pressed={activityView === "upcoming"}
          onClick={() => setActivityView("upcoming")}
        >
          Upcoming
        </Button>
        <Button
          variant={activityView === "history" ? "default" : "ghost"}
          aria-pressed={activityView === "history"}
          onClick={() => setActivityView("history")}
        >
          History
        </Button>
      </div>
      <section className="panel activity-toolbar">
        <label htmlFor="activity-search">
          Search {activityView === "history" ? "history" : "upcoming"}
        </label>
        <input
          id="activity-search"
          type="search"
          placeholder={
            activityView === "history" ? "Search history…" : "Search upcoming…"
          }
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button
          variant="outline"
          disabled={!campaigns?.length}
          onClick={exportActivity}
        >
          Export CSV
        </Button>
        <p className="muted">
          Search and export include the latest 100 saved campaigns loaded here.
        </p>
      </section>
      <section className="panel">
        <p className="muted">
          Run and pause campaigns from your connected Chrome extension. A
          single-post validation and your explicit result confirmation are
          required before bulk publishing. Nothing starts from this queue page.
        </p>
        <Button variant="outline" disabled={busy} onClick={() => void load()}>
          Refresh queue
        </Button>
      </section>
      {error && (
        <p role="alert" className="group-error">
          {error}
        </p>
      )}
      {list && !campaigns?.length && (
        <section className="panel empty-state">
          <h2>
            {search
              ? "No matching campaigns"
              : activityView === "history"
                ? "No campaign history yet"
                : "No upcoming campaigns"}
          </h2>
          <p>
            Save a campaign to keep its text, selected groups and media
            together.
          </p>
        </section>
      )}
      {campaigns?.map((c) => (
        <article className="panel" key={c.id}>
          <h2>{c.title || c.plan.text.slice(0, 80)}</h2>
          <p>
            {c.state} · Saved{" "}
            {new Date(c.created_at).toLocaleString("en-PH", {
              timeZone: "Asia/Manila",
            })}{" "}
            (Asia/Manila)
          </p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void command("inspect", c.id, c.revision)}
          >
            Open campaign details
          </Button>
        </article>
      ))}
      {job && (
        <section className="panel">
          <h2>Campaign details</h2>
          <p>
            {job.state} · Version {job.revision}
          </p>
          <p className="campaign-post-preview">{job.plan.text}</p>
          <p>
            Next eligible:{" "}
            {new Date(job.next_eligible_at).toLocaleString("en-PH", {
              timeZone: "Asia/Manila",
            })}{" "}
            (Asia/Manila)
          </p>
          {job.stop_reason && <p>{job.stop_reason}</p>}
          <p>{job.media.length} media attachment(s)</p>
          <ol>
            {job.targets.map((t) => (
              <li key={t.id}>
                {t.position + 1}. {t.state}
                {t.post_url && (
                  <>
                    {" "}
                    ·{" "}
                    <a
                      href={t.post_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View reported post
                    </a>
                  </>
                )}
                {["uncertain", "stopped"].includes(t.state) && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setReviewTarget(t.id);
                      setReviewOutcome("not_sent");
                      setReviewed(false);
                      setPostUrl("");
                    }}
                  >
                    Review outcome for group {t.position + 1}
                  </Button>
                )}
                {t.receipt_source && (
                  <span className="muted">
                    {" "}
                    ·{" "}
                    {t.receipt_source === "user_review"
                      ? "Recorded by you"
                      : "Reported by extension; not independently verified"}
                  </span>
                )}
              </li>
            ))}
          </ol>
          {reviewTarget && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void command("resolve", job.id, job.revision, {
                  target_id: reviewTarget,
                  reviewed: true,
                  outcome: reviewOutcome,
                  ...(postUrl.trim() ? { post_url: postUrl.trim() } : {}),
                });
              }}
            >
              <h3>Record the outcome you checked in Facebook</h3>
              <p>
                This records your review. It does not retry or publish a post.
              </p>
              <label htmlFor="review-outcome">Observed result</label>
              <select
                id="review-outcome"
                value={reviewOutcome}
                onChange={(event) => setReviewOutcome(event.target.value)}
              >
                <option value="not_sent">Not sent</option>
                <option value="live">Published</option>
                <option value="pending_admin">Pending admin approval</option>
              </select>
              <label htmlFor="review-post-url">Facebook group post URL</label>
              <input
                id="review-post-url"
                type="url"
                value={postUrl}
                required={reviewOutcome !== "not_sent"}
                onChange={(event) => setPostUrl(event.target.value)}
              />
              <label>
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(event) => setReviewed(event.target.checked)}
                />
                I checked this submission in Facebook and confirm this result.
              </label>
              <Button type="submit" disabled={busy || !reviewed}>
                Record reviewed outcome
              </Button>
            </form>
          )}
          <div className="group-actions">
            <Button
              variant="outline"
              disabled={busy || job.state !== "running"}
              onClick={() => void command("pause")}
            >
              Pause
            </Button>
            <Button
              variant="outline"
              disabled={busy || ["completed", "cancelled"].includes(job.state)}
              onClick={() => void command("cancel")}
            >
              Cancel campaign
            </Button>
            <Button
              variant="outline"
              disabled={busy || !job.targets.some((t) => t.state === "claimed")}
              onClick={() => void command("recover")}
            >
              Check interrupted submission
            </Button>
            <Button disabled>Resume posting — unavailable</Button>
          </div>
        </section>
      )}
    </div>
  );
}
