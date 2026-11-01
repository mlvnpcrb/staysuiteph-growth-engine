"use client";
import Link from "next/link";
import { Button } from "@staysuite/ui";
import { effectiveReview, groupOverview } from "@staysuite/validation";
import { useGroups } from "./use-groups";
export function SavedOverview() {
  const { groups, stats, loading, error, reload } = useGroups();
  const summary = { ...groupOverview(groups), ...stats };
  const pending = groups.filter((group) => effectiveReview(group) === "review_required");
  return (
    <section aria-label="Saved group activity">
      <div className="section-heading">
        <h2>Your workspace at a glance</h2>
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
          <section className="panel attention-panel" aria-labelledby="attention-title">
            <div className="section-heading">
              <h2 id="attention-title">Needs your attention</h2>
              <span className="subtle-badge">Rules review</span>
            </div>
            {pending.length ? (
              <>
                <p className="muted">Review the rules for these saved groups before planning outreach.</p>
                <ul className="attention-list">
                  {pending.slice(0, 3).map((group) => (
                    <li key={group.id}>
                      <div><strong>{group.title}</strong><span className="muted">{group.destination || "Destination not set"}</span></div>
                      <Link className="growth-text-link" href={`/dashboard/my-groups#group-${group.id}`}>Review group<span className="sr-only">: {group.title}</span></Link>
                    </li>
                  ))}
                </ul>
                {pending.length > 3 ? <Link className="growth-text-link" href="/dashboard/my-groups">View all {pending.length} groups needing review</Link> : null}
              </>
            ) : groups.length ? (
              <p className="muted">No outstanding rule reviews in your loaded shortlist. Recheck each group’s requirements before planning outreach.</p>
            ) : (
              <div className="growth-empty"><p>Save your first group to start building your shortlist.</p><Button asChild><Link href="/dashboard/group-finder">Find your first group</Link></Button></div>
            )}
          </section>
          <div className="panel recent-groups">
            <h3>Recently updated</h3>
            {summary.recent.length ? (
              <ul>
                {summary.recent.map((g) => (
                  <li key={g.id}>
                    <Link href={`/dashboard/my-groups#group-${g.id}`}>{g.title}</Link>
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
