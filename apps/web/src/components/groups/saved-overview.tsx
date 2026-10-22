"use client";
import Link from "next/link";
import { Button } from "@staysuite/ui";
import { groupOverview } from "@staysuite/validation";
import { useGroups } from "./use-groups";
export function SavedOverview() {
  const { groups, stats, loading, error, reload } = useGroups();
  const summary = { ...groupOverview(groups), ...stats };
  return (
    <section aria-label="Saved group activity">
      <div className="section-heading">
        <h2>Your community shortlist</h2>
        <Link className="welcome-link" href="/dashboard/my-groups">
          Manage groups
        </Link>
      </div>
      {error ? (
        <div className="panel">
          <p role="alert" className="group-error">
            {error}
          </p>
          <Button variant="outline" onClick={() => void reload()}>
            Retry loading
          </Button>
        </div>
      ) : loading ? (
        <p role="status" className="panel">
          Loading saved group activity…
        </p>
      ) : (
        <>
          <div className="metric-grid">
            {[
              { label: "Saved groups", value: summary.total },
              { label: "Rules need review", value: summary.needsReview },
              { label: "Personally reviewed", value: summary.reviewed },
            ].map((metric) => (
              <article className="metric-card" key={metric.label}>
                <span className="muted text-sm">{metric.label}</span>
                <p className="metric-value">{metric.value}</p>
              </article>
            ))}
          </div>
          <div className="panel recent-groups">
            <h3>Recently updated</h3>
            {summary.recent.length ? (
              <ul>
                {summary.recent.map((g) => (
                  <li key={g.id}>
                    <Link href="/dashboard/my-groups">{g.title}</Link>
                    <span className="muted text-sm">
                      {g.destination} ·{" "}
                      {new Date(g.updated_at).toLocaleDateString("en-PH", {
                        timeZone: "Asia/Manila",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">
                No saved activity yet. Add a group to begin.
              </p>
            )}
            <p className="muted text-sm">
              Counts reflect up to 500 recent saved groups. A personal rule
              review does not establish posting permission.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
