"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@staysuite/ui";
import Link from "next/link";
import {
  parseGroupCollection,
  parseGroupTransfer,
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
  const currentGroups = useRef<GroupCollection["groups"]>([]);
  const importBusy = useRef(false);
  const [outcomes, setOutcomes] = useState<
    Record<string, "saved" | "already_saved" | "failed">
  >({});
  function acceptCollection(collection: GroupCollection) {
    const merged = new Map(currentGroups.current.map((g) => [g.url, g]));
    for (const group of collection.groups) merged.set(group.url, group);
    if (merged.size > 100) throw new Error("batch_limit");
    currentGroups.current = [...merged.values()];
    setGroups(currentGroups.current);
    setSelected(
      (previous) =>
        new Set([...previous, ...collection.groups.map((g) => g.url)]),
    );
    setOutcomes({});
  }
  useEffect(() => {
    setReady(true);
    const receive = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin)
        return;
      const data: unknown = event.data;
      if (
        !data ||
        typeof data !== "object" ||
        !("type" in data) ||
        data.type !== "STAYSUITE_GROUP_IMPORT"
      )
        return;
      if (
        !("transfer_id" in data) ||
        typeof data.transfer_id !== "string" ||
        !/^[a-f0-9-]{36}$/i.test(data.transfer_id)
      )
        return;
      const ack = (result: string) =>
        window.postMessage(
          {
            type: "STAYSUITE_GROUP_IMPORT_ACK",
            transfer_id: data.transfer_id,
            result,
          },
          window.location.origin,
        );
      if (importBusy.current) {
        ack("busy");
        return;
      }
      try {
        const parsed = parseGroupTransfer(data);
        acceptCollection(parsed.collection);
        setError("");
        setStatus(
          "Groups received from your extension. Review the selection and click Save selected groups to import into My Groups. Nothing has been saved yet.",
        );
        ack("received");
      } catch (error) {
        const result =
          error instanceof Error && error.message === "batch_limit"
            ? "batch_limit"
            : "invalid_payload";
        setError(
          result === "batch_limit"
            ? "Batch limit exceeded. Save and clear the current batch before receiving more groups."
            : "The extension collection was rejected. No groups were saved.",
        );
        ack(result);
      }
    };
    window.addEventListener("message", receive);
    return () => {
      stop.current = true;
      window.removeEventListener("message", receive);
    };
  }, []);
  const context = searchGroupsSchema.safeParse(search);
  const candidates = groups.map((group) => ({
    ...search,
    ...group,
    evidence: "",
  }));
  const assessed = candidates
    .map((candidate) => ({
      candidate,
      assessment: context.success ? assessGroup(candidate, candidate) : null,
    }))
    .sort((a, b) => (b.assessment?.score ?? 0) - (a.assessment?.score ?? 0));
  async function load(file: File) {
    setError("");
    setStatus("");
    if (file.size > 100_000) {
      setError("Collection is too large (100 KB maximum).");
      return;
    }
    setLoading(true);
    importBusy.current = true;
    try {
      const parsed = parseGroupCollection(await file.text());
      acceptCollection(parsed);
      setStatus(
        "Collection loaded. Review your selection before saving. No data has been saved yet.",
      );
    } catch {
      setError(
        "Invalid collection or batch limit exceeded. Use a StaySuite JSON export with 1–100 group names and links; save and clear the current batch before adding more than 100 unique groups.",
      );
    } finally {
      setLoading(false);
      importBusy.current = false;
    }
  }
  async function saveSelected() {
    if (!context.success) {
      setError("Enter a destination above before assessing or saving groups.");
      return;
    }
    if (importBusy.current) return;
    importBusy.current = true;
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
        setOutcomes((previous) => ({
          ...previous,
          [group.url]: result.duplicate ? "already_saved" : "saved",
        }));
        if (result.duplicate) duplicates++;
        else saved++;
      } catch (error) {
        setOutcomes((previous) => ({ ...previous, [group.url]: "failed" }));
        setError(
          error instanceof Error ? error.message : "Could not save groups.",
        );
        failed = true;
        break;
      }
    }
    setSaving(false);
    importBusy.current = false;
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
      data-staysuite-group-receiver={ready ? "ready" : "loading"}
    >
      <span className="subtle-badge">Free · User-controlled collection</span>
      <h2>Bring your joined groups together</h2>
      <p className="muted">
        In the StaySuite Chrome extension, open Facebook’s Your Groups page,
        collect visible names and links, review, then choose Send selected
        groups to StaySuite. You can also import an exported JSON file below.
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
                loading ||
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
                currentGroups.current = [];
                setGroups([]);
                setOutcomes({});
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
                {outcomes[candidate.url] && (
                  <span className="subtle-badge">
                    {outcomes[candidate.url] === "saved"
                      ? "Imported successfully"
                      : outcomes[candidate.url] === "already_saved"
                        ? "Already in My Groups"
                        : "Import failed — retry available"}
                  </span>
                )}
                {assessment && (
                  <span className="subtle-badge">
                    {assessment.score}/100 text relevance ·{" "}
                    {assessment.confidence} confidence
                  </span>
                )}
                <a
                  className="group-source"
                  href={candidate.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Review original group
                </a>
                {assessment && (
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
                )}
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
          {status} <Link href="/dashboard/my-groups">Open My Groups</Link>
        </p>
      )}
    </section>
  );
}
