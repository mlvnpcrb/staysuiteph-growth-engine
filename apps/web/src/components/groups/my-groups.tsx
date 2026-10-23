"use client";
import { MarketingAnalysis } from "./marketing-analysis";
import { categorizeGroupName, groupCategories, type GroupCategoryId, rankGroupMarketing } from "@staysuite/validation";
import { CollectionImport } from "./collection-import";
import { useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button } from "@staysuite/ui";
import type { SavedGroup } from "@staysuite/types";
import { effectiveReview } from "@staysuite/validation";
import { groupRequest, useGroups } from "./use-groups";
function GroupEntry({
  group,
  onRefresh,
  onMessage,
}: {
  group: SavedGroup;
  onRefresh: () => Promise<void>;
  onMessage: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [confirmReview, setConfirmReview] = useState(false);
  const [notes, setNotes] = useState(group.notes);
  const [rules, setRules] = useState(group.rule_evidence);
  const [status, setStatus] = useState(group.review_status);
  const [destination, setDestination] = useState(group.destination);
  const [accommodation, setAccommodation] = useState(group.accommodation);
  const [audience, setAudience] = useState(group.audience);
  return (
    <article className="panel saved-group">
      <div className="section-heading">
        <div>
          <span className="subtle-badge">
            {effectiveReview(group) === "reviewed"
              ? "Personally reviewed"
              : effectiveReview(group) === "not_suitable"
                ? "Not suitable"
                : "Rules need review"}
          </span>
          <h2>{group.title}</h2>
        </div>
        <a
          aria-label={`Open ${group.title} on Facebook`}
          href={group.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={19} />
        </a>
      </div>
      <div className="smart-category-labels" aria-label="Suggested categories">{categorizeGroupName(group.title).map(match=><span className="subtle-badge" key={match.id} title={match.matchedTerms.length?`Name contains: ${match.matchedTerms.join(", ")}`:"No category keyword matched this name"}>{match.label}</span>)}</div>
      <p className="muted">
        {[group.destination, group.accommodation, group.audience]
          .filter(Boolean)
          .join(" · ") || "Add hosting context when you’re ready"}
      </p>
      <p className="muted text-sm">
        Source: manually supplied, not independently verified. Saved{" "}
        {new Date(group.created_at).toLocaleDateString("en-PH", {
          timeZone: "Asia/Manila",
        })}
        .
      </p>
      <MarketingAnalysis
        group={group}
        onRefresh={onRefresh}
        onMessage={onMessage}
      />
      {group.evidence && (
        <blockquote className="group-evidence">{group.evidence}</blockquote>
      )}
      <details>
        <summary>Notes &amp; rule review</summary>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await groupRequest("PATCH", {
                id: group.id,
                notes,
                review_status: status,
                rule_evidence: rules,
                confirm_review: confirmReview,
                destination,
                accommodation,
                audience,
              });
              onMessage("Notes and review saved.");
              await onRefresh();
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Changes could not be saved.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>Hosting context (optional)</h3>
          <label>
            Destination
            <input
              value={destination}
              maxLength={100}
              onChange={(e) => setDestination(e.target.value)}
            />
          </label>
          <label>
            Accommodation
            <select
              value={accommodation}
              onChange={(e) => setAccommodation(e.target.value)}
            >
              {[
                "",
                "Condo",
                "Apartment",
                "Hotel",
                "Resort",
                "Vacation rental",
              ].map((v) => (
                <option value={v} key={v}>
                  {v || "Not set"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Audience
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            >
              <option value="">Not set</option>
              <option>Guests</option>
              <option>Hosts</option>
            </select>
          </label>
          <label htmlFor={`notes-${group.id}`}>Private notes</label>
          <textarea
            id={`notes-${group.id}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={4000}
          />
          <Button type="button" variant="outline" onClick={() => setNotes("")}>
            Clear notes
          </Button>
          <p className="muted text-sm">
            Clear the text and save changes to remove your notes.
          </p>
          <label htmlFor={`rules-${group.id}`}>
            Rules you personally reviewed
          </label>
          <textarea
            id={`rules-${group.id}`}
            value={rules}
            onChange={(e) => {
              setRules(e.target.value);
              setStatus("review_required");
            }}
            rows={4}
            maxLength={4000}
            placeholder="Record the rule excerpt and any approval, membership or frequency requirements."
          />
          <label htmlFor={`status-${group.id}`}>Review status</label>
          <select
            id={`status-${group.id}`}
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as SavedGroup["review_status"])
            }
          >
            <option value="review_required">Needs review</option>
            <option value="reviewed">Personally reviewed</option>
            <option value="not_suitable">Not suitable</option>
          </select>
          <p className="muted text-sm">
            Last personally reviewed:{" "}
            {group.last_reviewed_at
              ? new Date(group.last_reviewed_at).toLocaleDateString("en-PH", {
                  timeZone: "Asia/Manila",
                })
              : "Not yet"}
            . Reviews need refreshing after 30 days. Reviewed does not mean
            permission to publish.
          </p>
          <label className="review-confirm">
            <input
              type="checkbox"
              checked={confirmReview}
              onChange={(e) => setConfirmReview(e.target.checked)}
            />
            I personally reviewed these rules today
          </label>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </details>
      <div className="group-actions">
        {confirm ? (
          <>
            <span>Remove from your shortlist?</span>
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await groupRequest("DELETE", { id: group.id });
                  onMessage("Group removed from your shortlist.");
                  await onRefresh();
                } catch {
                  setError("Group could not be removed. Please retry.");
                } finally {
                  setBusy(false);
                  setConfirm(false);
                }
              }}
            >
              Confirm removal
            </Button>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Keep group
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={() => setConfirm(true)}>
            Remove group
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="group-error">
          {error}
        </p>
      )}
    </article>
  );
}
export function MyGroups() {
  const { groups, stats, loading, error, reload } = useGroups();
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("");
  const [review, setReview] = useState("all");
  const [sort, setSort] = useState("marketing");
  const [category, setCategory] = useState<GroupCategoryId|"all">("all");
  const categories = new Map(groups.map(group=>[group.id,categorizeGroupName(group.title)]));
  const categoryCounts = new Map<GroupCategoryId,number>();
  for(const matches of categories.values())for(const match of matches)categoryCounts.set(match.id,(categoryCounts.get(match.id)??0)+1);
  const [permission, setPermission] = useState("all");
  const reports = new Map(groups.map((g) => [g.id, rankGroupMarketing(g)]));
  const visible = groups
    .filter(group=>category==="all"||categories.get(group.id)?.some(match=>match.id===category))
    .filter(
      (g) =>
        `${g.title} ${g.destination}`
          .toLowerCase()
          .includes(filter.toLowerCase()) &&
        (review === "all" || effectiveReview(g) === review),
    )
    .filter(
      (g) =>
        permission === "all" || reports.get(g.id)?.readiness === permission,
    )
    .sort((a, b) => {
      if (sort === "newest") return b.created_at.localeCompare(a.created_at);
      const left = reports.get(a.id)!,
        right = reports.get(b.id)!;
      if (sort === "coverage") return right.coverage - left.coverage;
      const priority = { reviewed_permission: 2, needs_review: 1, blocked: 0 };
      return (
        priority[right.readiness] - priority[left.readiness] ||
        (right.score ?? -1) - (left.score ?? -1) ||
        right.coverage - left.coverage ||
        a.title.localeCompare(b.title)
      );
    });
  return (
    <div className="page group-workspace">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Your community shortlist</span>
          <h1>My Groups</h1>
          <p className="muted">Keep the context, not just the link.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/group-finder">Find more groups</Link>
        </Button>
      </div>
      <CollectionImport onImported={reload} />
      <section className="panel smart-group-categories" aria-label="Smart group categories"><div role="group" aria-label="Filter groups by category" className="smart-category-filters"><button type="button" aria-pressed={category==="all"} onClick={()=>setCategory("all")}>All <span>{groups.length}</span></button>{groupCategories.map(item=><button type="button" key={item.id} aria-pressed={category===item.id} onClick={()=>setCategory(item.id)}>{item.label} <span>{categoryCounts.get(item.id)??0}</span></button>)}</div><p className="muted text-sm">Suggested from group names. Groups can appear in multiple categories. These labels do not verify rules or permission to post.</p></section>
      <div id="saved-groups" className="panel finder-fields">
        <label>
          Filter saved groups
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Name or destination"
          />
        </label>
        <label>
          Rules status
          <select value={review} onChange={(e) => setReview(e.target.value)}>
            <option value="all">All groups</option>
            <option value="review_required">Needs review</option>
            <option value="reviewed">Personally reviewed</option>
            <option value="not_suitable">Not suitable</option>
          </select>
        </label>
        <label>
          Rank groups
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="marketing">Marketing priority</option>
            <option value="coverage">Evidence coverage</option>
            <option value="newest">Newest saved</option>
          </select>
        </label>
        <label>
          Permission review
          <select
            value={permission}
            onChange={(e) => setPermission(e.target.value)}
          >
            <option value="all">All groups</option>
            <option value="reviewed_permission">Reviewed permission</option>
            <option value="needs_review">Needs review</option>
            <option value="blocked">Blocked</option>
          </select>
        </label>
      </div>
      <p className="muted text-sm">
        Marketing priority puts reviewed permission first, blocked groups last,
        then compares evidence-based scores. Ranking covers the loaded
        shortlist, not predicted bookings. Unknown evidence never adds points.
      </p>
      {loading && (
        <div className="panel" role="status">
          Loading your saved groups…
        </div>
      )}
      {error && (
        <section className="panel">
          <p role="alert" className="group-error">
            {error}
          </p>
          <Button variant="outline" onClick={() => void reload()}>
            Retry loading
          </Button>
        </section>
      )}
      {message && (
        <p role="status" className="group-success">
          {message}
        </p>
      )}
      {!loading &&
        !error &&
        (visible.length ? (
          <>
            <p className="muted text-sm">
              {visible.length} of {stats.total} saved groups shown. Up to 500
              recent groups.
            </p>
            <div className="saved-grid">
              {visible.map((g) => (
                <GroupEntry
                  key={`${g.id}-${g.updated_at}`}
                  group={g}
                  onRefresh={reload}
                  onMessage={setMessage}
                />
              ))}
            </div>
          </>
        ) : (
          <section className="panel empty-state">
            <h2>
              {groups.length
                ? "No groups match these filters."
                : "Your shortlist starts with one good group."}
            </h2>
            <p className="muted">
              {groups.length
                ? "Try another category, search, or review status."
                : "Search for communities and save a real group link in Group Finder."}
            </p>
            <Button asChild>
              <Link href="/dashboard/group-finder">Explore Group Finder</Link>
            </Button>
          </section>
        ))}
    </div>
  );
}
