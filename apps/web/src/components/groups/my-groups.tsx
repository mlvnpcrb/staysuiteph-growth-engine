"use client";
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@staysuite/ui";
import type { SavedGroup } from "@staysuite/types";
import {
  effectiveReview,
  marketingEvidenceSchema,
} from "@staysuite/validation";
import { groupRequest, useGroups } from "./use-groups";
import { CollectionImport } from "./collection-import";

function GroupEntry({
  group,
  reload,
  notify,
}: {
  group: SavedGroup;
  reload: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState(group.rule_evidence);
  const [status, setStatus] = useState(group.review_status);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [remove, setRemove] = useState(false);
  const existing = marketingEvidenceSchema.safeParse(
    group.marketing_evidence ?? {},
  );
  const [permission, setPermission] = useState(
    existing.success && existing.data.promotion_allowed !== null
      ? String(existing.data.promotion_allowed)
      : "unknown",
  );
  useEffect(() => {
    const reveal = () => {
      if (window.location.hash === `#group-${group.id}`) setOpen(true);
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [group.id]);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!confirmed && permission !== "unknown")
        throw new Error(
          "Confirm that you personally checked these requirements today.",
        );
      await groupRequest("PATCH", {
        id: group.id,
        notes: group.notes,
        rule_evidence: rules,
        review_status: status,
        confirm_review: confirmed,
      });
      if (confirmed)
        await groupRequest("PATCH", {
          id: group.id,
          operation: "marketing_evidence",
          marketing_evidence: {
            ...(existing.success
              ? existing.data
              : marketingEvidenceSchema.parse({})),
            observed_at: new Date().toISOString(),
            source_url: group.url,
            promotion_allowed:
              permission === "unknown" ? null : permission === "true",
          },
        });
      setConfirmed(false);
      notify("Posting requirements saved.");
      await reload();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Requirements could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <article id={`group-${group.id}`} className="panel saved-group">
      <div className="group-row reference-group-row">
        <div className="group-row-name">
          <h2>{group.title}</h2>
          <span className="muted">Members unavailable</span>
        </div>
        <span className={`review-pill review-${effectiveReview(group)}`}>
          {effectiveReview(group) === "reviewed"
            ? "Personally reviewed"
            : effectiveReview(group) === "not_suitable"
              ? "Not suitable"
              : "Rules need review"}
        </span>
        <div className="group-row-actions">
          <Button
            variant="outline"
            aria-label={`Posting requirements: ${group.title}`}
            aria-expanded={open}
            aria-controls={`requirements-${group.id}`}
            onClick={() => setOpen(!open)}
          >
            Posting requirements<span className="sr-only">: {group.title}</span>
          </Button>
          <a
            className="group-external"
            href={group.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${group.title} on Facebook`}
          >
            <ExternalLink size={18} />
          </a>
        </div>
      </div>
      <div
        id={`requirements-${group.id}`}
        className="group-detail"
        hidden={!open}
      >
        <form onSubmit={save}>
          <label>
            Group rules
            <textarea
              value={rules}
              maxLength={4000}
              rows={3}
              onChange={(event) => {
                setRules(event.target.value);
                setStatus("review_required");
              }}
            />
          </label>
          <label>
            Review status
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as SavedGroup["review_status"])
              }
            >
              <option value="review_required">Needs review</option>
              <option value="reviewed">Personally reviewed</option>
              <option value="not_suitable">Not suitable</option>
            </select>
          </label>
          <label>
            Promotional posts allowed
            <select
              value={permission}
              onChange={(event) => setPermission(event.target.value)}
            >
              <option value="unknown">Unknown</option>
              <option value="true">Yes, personally checked</option>
              <option value="false">No</option>
            </select>
          </label>
          <label className="review-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            I personally checked these requirements today
          </label>
          <p className="muted text-sm">
            This records your review. It does not establish membership or
            guarantee posting permission.
          </p>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save requirements"}
          </Button>
        </form>
        <div className="group-actions">
          {remove ? (
            <>
              <span>Remove this group from your list?</span>
              <Button
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await groupRequest("DELETE", { id: group.id });
                    notify("Group removed.");
                    await reload();
                  } catch {
                    setError("Group could not be removed.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Confirm removal
              </Button>
              <Button variant="outline" onClick={() => setRemove(false)}>
                Keep group
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setRemove(true)}>
              Remove group
            </Button>
          )}
        </div>
        {error ? (
          <p role="alert" className="group-error">
            {error}
          </p>
        ) : null}
      </div>
    </article>
  );
}
export function MyGroups() {
  const { groups, stats, loading, error, reload } = useGroups();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [message, setMessage] = useState("");
  const visible = groups
    .filter((group) => group.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) =>
      sort === "name"
        ? a.title.localeCompare(b.title)
        : sort === "oldest"
          ? a.created_at.localeCompare(b.created_at)
          : b.created_at.localeCompare(a.created_at),
    );
  return (
    <div className="page group-workspace">
      <div className="page-heading">
        <div>
          <h1>All groups</h1>
          <p className="muted">Your Facebook group library.</p>
        </div>
      </div>
      <CollectionImport onImported={reload} />
      <div className="panel reference-group-filters">
        <label>
          Search groups
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name"
          />
        </label>
        <label>
          Sort groups
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name A–Z</option>
          </select>
        </label>
      </div>
      {loading ? <p role="status">Loading groups…</p> : null}
      {error ? (
        <div className="panel">
          <p role="alert" className="group-error">
            {error}
          </p>
          <Button variant="outline" onClick={() => void reload()}>
            Retry loading
          </Button>
        </div>
      ) : null}
      {message ? (
        <p role="status" className="group-success">
          {message}
        </p>
      ) : null}
      {!loading && !error ? (
        <>
          <p className="muted text-sm">
            {visible.length} of {stats.total} groups shown. Up to 500 recent
            groups.
          </p>
          <div className="saved-grid">
            {visible.map((group) => (
              <GroupEntry
                key={group.id}
                group={group}
                reload={reload}
                notify={setMessage}
              />
            ))}
          </div>
          {!visible.length ? (
            <section className="panel empty-state">
              <h2>
                {groups.length
                  ? "No groups match your search."
                  : "No groups imported yet."}
              </h2>
              <p>
                {groups.length
                  ? "Try another group name."
                  : "Connect your extension and import your Facebook groups above."}
              </p>
              {groups.length ? (
                <Button variant="outline" onClick={() => setSearch("")}>
                  Clear search
                </Button>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
