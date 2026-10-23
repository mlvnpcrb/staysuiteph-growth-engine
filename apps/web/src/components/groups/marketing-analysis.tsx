"use client";
import { useState } from "react";
import { Button } from "@staysuite/ui";
import type { SavedGroup } from "@staysuite/types";
import {
  marketingEvidenceSchema,
  rankGroupMarketing,
  assessPostingPriority,
} from "@staysuite/validation";
import { groupRequest } from "./use-groups";
const fields = [
  ["posts_7d", "Posts in the last 7 days"],
  ["sample_posts", "Posts sampled for comments"],
  ["sample_comments", "Total comments on sampled posts"],
  ["enquiries_30d", "Your enquiries in the last 30 days"],
  ["bookings_30d", "Your bookings in the last 30 days"],
] as const;
export function MarketingAnalysis({
  group,
  onRefresh,
  onMessage,
}: {
  group: SavedGroup;
  onRefresh: () => Promise<void>;
  onMessage: (message: string) => void;
}) {
  const report = rankGroupMarketing(group);
  const priority = assessPostingPriority(group);
  const existing = marketingEvidenceSchema.safeParse(
    group.marketing_evidence ?? {},
  );
  const data = existing.success ? existing.data : null;
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function persist(evidence: unknown) {
    setError("");
    const parsed = marketingEvidenceSchema.safeParse(evidence);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your observations.");
      return;
    }
    setBusy(true);
    try {
      await groupRequest("PATCH", {
        id: group.id,
        operation: "marketing_evidence",
        marketing_evidence: parsed.data,
      });
      onMessage(
        parsed.data.observed_at
          ? "Marketing evidence saved. Ranking updated."
          : "Marketing evidence cleared. Rule reviews and notes are unchanged.",
      );
      await onRefresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save evidence.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="marketing-analysis"
      aria-label={`Marketing analysis for ${group.title}`}
    >
      <h3>Where to post first</h3>
      <p><strong>{priority.label}</strong></p>
      <p className="muted text-sm">{priority.reason}</p>
      <p className="muted text-sm">{priority.basis}. Visibility, competition and buyer intent are unverified. This recommendation does not confirm permission to post.</p>
      <div className="section-heading">
        <h3>Marketing potential</h3>
        <span className="subtle-badge">
          {report.score === null
            ? "Insufficient evidence"
            : `${report.score}/100 marketing score`}
        </span>
      </div>
      <p className="muted text-sm">
        {report.coverage}% evidence coverage · {report.confidence} confidence ·
        User-reported evidence
      </p>
      <p className="subtle-badge">
        {report.readiness === "blocked"
          ? "Blocked for campaign planning"
          : report.readiness === "reviewed_permission"
            ? "Permission reviewed — recheck for each campaign"
            : "Campaign planning blocked — review rules and permission"}
      </p>
      <details>
        <summary>Score breakdown &amp; evidence</summary>
        <ul className="evidence-list text-sm">
          {report.dimensions.map((d) => (
            <li key={d.name}>
              <strong>
                {d.name}:{" "}
                {d.points === null ? "Unknown" : `${d.points}/${d.maximum}`}
              </strong>
              <p className="muted">{d.reason}</p>
            </li>
          ))}
        </ul>
        <p className="muted text-sm">{report.explanation}</p>
        <p className="muted text-sm">
          Activity points: 1/3/7 posts earn 6/12/20. Comments per sampled post:
          positive/2/5 earn 6/12/20. Enquiries: 1/5 earn 8/15; bookings: 1/2
          earn 10/15. Fit awards 10 per matched location, accommodation and
          audience signal. These are product heuristics, not industry
          benchmarks. Small samples, spam, member quality and causal attribution
          are not verified.
        </p>
        {data?.observed_at && (
          <p className="muted text-sm">
            Observed{" "}
            {new Date(data.observed_at).toLocaleString("en-PH", {
              timeZone: "Asia/Manila",
            })}{" "}
            (Asia/Manila).{" "}
            {report.fresh
              ? "Fresh observation."
              : "Stale or invalid evidence does not add points."}
          </p>
        )}
        {data?.source_url && (
          <a
            className="group-source"
            href={data.source_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            View evidence source
          </a>
        )}
      </details>
      <details>
        <summary>Record marketing evidence</summary>
        <p className="muted text-sm">
          Use aggregate counts you personally observed. Leave unknown fields
          blank; zero means measured zero. Do not enter names, messages, member
          lists or comment text. Sample comments and posts from the preceding 7
          days; enquiries/bookings cover the preceding 30 days. Refresh
          observations within 7 days.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            const date = String(values.get("observed_at") ?? "");
            const observed = date ? new Date(`${date}T00:00:00+08:00`) : null;
            const numeric = Object.fromEntries(
              fields.map(([key]) => [
                key,
                values.get(key) === "" || values.get(key) === null
                  ? null
                  : Number(values.get(key)),
              ]),
            );
            void persist({
              ...numeric,
              observed_at:
                observed && Number.isFinite(observed.getTime())
                  ? observed.toISOString()
                  : null,
              source_url: String(values.get("source_url") ?? "") || null,
              promotion_allowed:
                values.get("promotion_allowed") === "unknown"
                  ? null
                  : values.get("promotion_allowed") === "yes",
            });
          }}
        >
          <label>
            Observation date (Asia/Manila)
            <input
              name="observed_at"
              type="date"
              defaultValue={
                data?.observed_at
                  ? new Date(Date.parse(data.observed_at) + 8 * 3600000)
                      .toISOString()
                      .slice(0, 10)
                  : ""
              }
            />
          </label>
          <label>
            Source group URL
            <input
              name="source_url"
              type="url"
              maxLength={500}
              defaultValue={data?.source_url ?? group.url}
            />
          </label>
          <div className="finder-fields">
            {fields.map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  name={key}
                  min={0}
                  max={1000000}
                  step={1}
                  defaultValue={data?.[key] ?? ""}
                  placeholder="Unknown"
                />
              </label>
            ))}
          </div>
          <label>
            Promotional content allowed (personally checked)
            <select
              name="promotion_allowed"
              defaultValue={
                data?.promotion_allowed === true
                  ? "yes"
                  : data?.promotion_allowed === false
                    ? "no"
                    : "unknown"
              }
            >
              <option value="unknown">Unknown</option>
              <option value="yes">Allowed under reviewed rules</option>
              <option value="no">Not allowed</option>
            </select>
          </label>
          <p className="muted text-sm">
            This attestation does not replace the existing rule evidence and
            fresh rule-review confirmation. It is not approval to publish.
          </p>
          <Button disabled={busy} type="submit">
            {busy ? "Saving evidence…" : "Save marketing evidence"}
          </Button>
          <Button
            disabled={busy}
            variant="outline"
            type="button"
            onClick={() => void persist({})}
          >
            Clear marketing evidence
          </Button>
        </form>
      </details>
      {error && (
        <p role="alert" className="group-error">
          {error}
        </p>
      )}
    </section>
  );
}
