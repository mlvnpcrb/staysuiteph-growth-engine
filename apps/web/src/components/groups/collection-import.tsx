"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@staysuite/ui";
import {
  parseGroupCollection,
  searchGroupsSchema,
  assessGroup,
  type GroupCollection,
} from "@staysuite/validation";
import type { GroupSearch } from "@staysuite/types";
import { groupRequest } from "./use-groups";

export function CollectionImport({ search }: { search: GroupSearch }) {
  const [groups, setGroups] = useState<GroupCollection["groups"]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState("");
  const stop = useRef(false);
  useEffect(() => {
    setReady(true);
    return () => {
      stop.current = true;
    };
  }, []);
  const context = searchGroupsSchema.safeParse(search);
  const candidates = context.success
    ? groups.map((group) => ({ ...context.data, ...group, evidence: "" }))
    : [];
  const assessed = candidates
    .map((candidate) => ({
      candidate,
      assessment: assessGroup(candidate, candidate),
    }))
    .sort((a, b) => b.assessment.score - a.assessment.score);
  async function load(file: File) {
    setError("");
    setStatus("");
    if (file.size > 100_000) {
      setError("Collection is too large (100 KB maximum).");
      return;
    }
    setLoading(true);
    try {
      const parsed = parseGroupCollection(await file.text());
      const merged = new Map(groups.map((g) => [g.url, g]));
      for (const group of parsed.groups) merged.set(group.url, group);
      if (merged.size > 100) throw new Error("Batch limit");
      setGroups([...merged.values()]);
      setSelected(
        (previous) =>
          new Set([...previous, ...parsed.groups.map((g) => g.url)]),
      );
      setStatus(
        "Collection loaded. Review your selection before saving. No data has been saved yet.",
      );
    } catch {
      setError(
        "Invalid collection or batch limit exceeded. Use a StaySuite JSON export with 1–100 group names and links; save and clear the current batch before adding more than 100 unique groups.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function saveSelected() {
    if (!context.success) {
      setError("Enter a destination above before assessing or saving groups.");
      return;
    }
    setSaving(true);
    stop.current = false;
    setError("");
    let saved = 0,
      duplicates = 0,
      failed = false;
    const batch = candidates.filter((g) => selected.has(g.url));
    for (const [index, group] of batch.entries()) {
      if (stop.current) break;
      setStatus(`Saving ${index + 1} of ${batch.length}…`);
      try {
        const result = await groupRequest("POST", group);
        if (result.duplicate) duplicates++;
        else saved++;
      } catch (error) {
        setError(
          error instanceof Error ? error.message : "Could not save groups.",
        );
        failed = true;
        break;
      }
    }
    setSaving(false);
    setStatus(
      `${saved} groups saved; ${duplicates} already saved.${stop.current ? " Saving stopped." : failed ? " Saving stopped after an error. Retry safely; saved groups are deduplicated." : ""}`,
    );
  }
  const visible = assessed.filter((g) =>
    g.candidate.title.toLowerCase().includes(filter.toLowerCase()),
  );
  return (
    <section
      className="panel collection-import"
      aria-label="Import joined groups"
    >
      <span className="subtle-badge">Free · User-controlled collection</span>
      <h2>Bring your joined groups together</h2>
      <p className="muted">
        In the StaySuite Chrome extension, open Facebook’s Your Groups page,
        collect visible names and links, review, and export. Import the JSON
        file here. You can import another batch after scrolling yourself.
      </p>
      <p className="muted text-sm">
        Files are processed locally until you choose Save. Only names and links
        are assessed; membership, activity and rules are unverified. Saved
        entries remain labeled user-supplied.
      </p>
      <label>
        Import StaySuite group collection
        <input
          type="file"
          accept=".json,application/json"
          disabled={!ready || saving || loading}
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (file) void load(file);
            e.currentTarget.value = "";
          }}
        />
      </label>
      {groups.length > 0 && (
        <>
          <h3>{groups.length} unique groups imported</h3>
          {!context.success && (
            <p className="muted">
              Enter your destination above to assess every imported group.
            </p>
          )}
          <label>
            Filter imported groups
            <input value={filter} onChange={(e) => setFilter(e.target.value)} />
          </label>
          <div className="group-actions">
            <Button
              variant="outline"
              disabled={saving || loading}
              onClick={() => setSelected(new Set(groups.map((g) => g.url)))}
            >
              Select all imported groups
            </Button>
            <Button
              variant="outline"
              disabled={saving || loading}
              onClick={() => setSelected(new Set())}
            >
              Deselect all
            </Button>
            <Button
              disabled={
                saving ||
                !context.success ||
                !candidates.some((g) => selected.has(g.url))
              }
              onClick={() => void saveSelected()}
            >
              Save selected groups
            </Button>
            {saving && (
              <Button
                variant="outline"
                onClick={() => {
                  stop.current = true;
                }}
              >
                Stop saving
              </Button>
            )}
            <Button
              variant="outline"
              disabled={saving || loading}
              onClick={() => {
                setGroups([]);
                setSelected(new Set());
                setStatus(
                  "Imported list cleared locally. Saved groups are unchanged.",
                );
              }}
            >
              Clear imported list
            </Button>
          </div>
          <p className="muted text-sm">
            Saving applies to all checked groups, including those hidden by the
            filter. Stop saving lets the current request finish.
          </p>
          <div className="collection-grid">
            {visible.map(({ candidate, assessment }) => (
              <article className="collection-card" key={candidate.url}>
                <label>
                  <input
                    type="checkbox"
                    disabled={saving || loading}
                    checked={selected.has(candidate.url)}
                    onChange={(e) =>
                      setSelected((previous) => {
                        const next = new Set(previous);
                        if (e.target.checked) next.add(candidate.url);
                        else next.delete(candidate.url);
                        return next;
                      })
                    }
                  />
                  {candidate.title}
                </label>
                <span className="subtle-badge">
                  {assessment.score}/100 text relevance ·{" "}
                  {assessment.confidence} confidence
                </span>
                <a
                  className="group-source"
                  href={candidate.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Review original group
                </a>
                <details>
                  <summary>Assessment &amp; unknowns</summary>
                  <ul className="evidence-list text-sm">
                    {[...assessment.reasons, ...assessment.unknowns].map(
                      (reason) => (
                        <li key={reason}>{reason}</li>
                      ),
                    )}
                  </ul>
                </details>
              </article>
            ))}
          </div>
          {context.success && !visible.length && (
            <p className="muted">No imported groups match this filter.</p>
          )}
          <p className="muted text-sm">
            Rule-based assessment · AI not connected. Imported lists are not
            retained after leaving this page; keep your export until saved.
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="group-error">
          {error}
        </p>
      )}
      {status && (
        <p role="status" className="group-success">
          {status}
        </p>
      )}
    </section>
  );
}
