"use client";
import { useEffect, useRef, useState } from "react";
import { groupRequest } from "./use-groups";
import { ExternalLink } from "lucide-react";
import { Button } from "@staysuite/ui";
import {
  parseGroupCollection,
  parseGroupTransfer,
  normalizeGroupUrl,
  type GroupCollection,
} from "@staysuite/validation";

export function CollectionImport({
  onImported,
}: {
  onImported?: () => Promise<void>;
}) {
  const [groups, setGroups] = useState<GroupCollection["groups"]>([]);
  const current = useRef<GroupCollection["groups"]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [known, setKnown] = useState<Set<string>>(new Set());
  const [outcomes, setOutcomes] = useState<
    Record<string, "saved" | "duplicate" | "failed">
  >({});
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changeSelection, setChangeSelection] = useState(false);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const busy = useRef(false),
    stop = useRef(false),
    generation = useRef(0);
  const identity = (url: string) => normalizeGroupUrl(url).identity;
  async function checkExisting(batch: GroupCollection["groups"]) {
    const run = ++generation.current;
    setChecking(true);
    setChecked(false);
    busy.current = true;
    setError("");
    try {
      const result = await groupRequest("POST", {
        operation: "check_duplicates",
        urls: batch.map((g) => g.url),
      });
      if (!result.identities) throw new Error("Incomplete check");
      if (run !== generation.current) return;
      const existing = new Set(result.identities);
      setKnown(existing);
      setSelected(
        new Set(
          batch.filter((g) => !existing.has(identity(g.url))).map((g) => g.url),
        ),
      );
      setChecked(true);
    } catch {
      if (run === generation.current)
        setError(
          "Couldn’t check your saved groups. Sign in if needed, then retry the check.",
        );
    } finally {
      if (run === generation.current) {
        setChecking(false);
        busy.current = false;
      }
    }
  }
  function accept(collection: GroupCollection) {
    const merged = new Map(current.current.map((g) => [g.url, g]));
    for (const group of collection.groups) merged.set(group.url, group);
    if (merged.size > 100) throw new Error("batch_limit");
    current.current = [...merged.values()];
    setGroups(current.current);
    setOutcomes({});
    setStatus("Groups received. Existing groups will stay unchanged.");
    void checkExisting(current.current);
  }
  useEffect(() => {
    setReady(true);
    const receive = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin) return;
      const data: unknown = event.data;
      if (!data || typeof data !== "object" || !("type" in data)) return;
      if (data.type === "STAYSUITE_EXTENSION_HELLO") {
        setConnected(true);
        return;
      }
      if (
        data.type !== "STAYSUITE_GROUP_IMPORT" ||
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
          location.origin,
        );
      if (busy.current) {
        ack("busy");
        return;
      }
      try {
        const parsed = parseGroupTransfer(data);
        accept(parsed.collection);
        setConnected(true);
        ack("received");
      } catch (error) {
        ack(
          error instanceof Error && error.message === "batch_limit"
            ? "batch_limit"
            : "invalid_payload",
        );
        setError(
          "Collection rejected. Check the format or save and clear this batch before adding more groups.",
        );
      }
    };
    window.addEventListener("message", receive);
    return () => {
      stop.current = true;
      generation.current++;
      window.removeEventListener("message", receive);
    };
  }, []);
  async function load(file: File) {
    if (busy.current) return;
    try {
      if (file.size > 100_000) throw new Error();
      accept(parseGroupCollection(await file.text()));
    } catch {
      setError(
        "Invalid collection or batch limit exceeded. Choose a StaySuite JSON export with up to 100 groups.",
      );
    }
  }
  const pending = groups.filter(
    (g) =>
      selected.has(g.url) &&
      !known.has(identity(g.url)) &&
      outcomes[g.url] !== "saved",
  );
  const failed = groups.filter((g) => outcomes[g.url] === "failed");
  async function save(batch: GroupCollection["groups"]) {
    if (busy.current || !checked || !batch.length) return;
    busy.current = true;
    stop.current = false;
    setSaving(true);
    setError("");
    for (const [index, group] of batch.entries()) {
      if (stop.current) break;
      setStatus(`Importing ${index + 1} of ${batch.length}…`);
      try {
        const result = await groupRequest("POST", { ...group });
        setOutcomes((previous) => ({
          ...previous,
          [group.url]: result.duplicate ? "duplicate" : "saved",
        }));
        setKnown((previous) => new Set([...previous, identity(group.url)]));
      } catch {
        setOutcomes((previous) => ({ ...previous, [group.url]: "failed" }));
        setError(
          "Import paused after a failure. Completed imports are safe; retry the failed group.",
        );
        break;
      }
    }
    busy.current = false;
    setSaving(false);
    setStatus(
      stop.current
        ? "Import stopped. Completed imports are safe."
        : "Import results are shown below.",
    );
    await onImported?.();
  }
  const imported = Object.values(outcomes).filter((v) => v === "saved").length;
  const duplicates = groups.filter(
    (g) => known.has(identity(g.url)) && outcomes[g.url] !== "saved",
  ).length;
  return (
    <section
      className="panel collection-import"
      aria-label="Import from Facebook"
      data-staysuite-group-receiver={ready ? "ready" : "loading"}
    >
      <div className="section-heading">
        <div>
          <span className="subtle-badge">
            {groups.length
              ? "Groups received"
              : connected
                ? "Ready to collect"
                : "Extension needed"}
          </span>
          <h2>Import from Facebook</h2>
        </div>
        <a
          className="welcome-link"
          href="https://www.facebook.com/groups/joins/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open Facebook Groups <ExternalLink size={14} aria-hidden="true" />
        </a>
      </div>
      <p className="muted">
        Use Sync groups in the StaySuite extension workspace to scan your visible
        Facebook directory and save new groups here automatically. File imports
        below remain available for review.
      </p>
      <details>
        <summary>Setup &amp; connection help</summary>
        <p className="muted text-sm">
          Install or reload the StaySuite extension, open Facebook’s Your Groups
          page, select groups, and send them to StaySuite. Allow access to this
          StaySuite site when Chrome asks. Detection is a browser-helper signal,
          not Facebook Login or proof of membership.
        </p>
        <label>
          Import StaySuite group collection
          <input
            type="file"
            accept=".json,application/json"
            disabled={!ready || checking || saving}
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) void load(file);
              e.currentTarget.value = "";
            }}
          />
        </label>
        <p className="muted text-sm">
          Only group names and links are checked against your saved groups.
          Nothing is saved until you import. No posts, messages, members,
          Facebook credentials or publishing access are collected.
        </p>
      </details>
      {groups.length > 0 && (
        <>
          <h3>
            Review {groups.length} {groups.length === 1 ? "group" : "groups"}
          </h3>
          <p className="muted text-sm">
            {checking
              ? "Checking existing groups…"
              : checked
                ? `${pending.length} selected new groups · ${duplicates} already saved`
                : "Duplicate check needed"}
            . Existing notes and rule reviews stay unchanged.
          </p>
          <label>
            Filter imported groups
            <input value={filter} onChange={(e) => setFilter(e.target.value)} />
          </label>
          <div className="group-actions">
            <Button
              disabled={saving || checking || !checked || !pending.length}
              onClick={() => void save(pending)}
            >
              {saving
                ? "Importing…"
                : checked && pending.length === 0
                  ? "Nothing new to import"
                  : `Import ${pending.length} ${pending.length === 1 ? "group" : "groups"}`}
            </Button>
            {failed.length > 0 && (
              <Button
                variant="outline"
                disabled={saving || checking}
                onClick={() => void save(failed)}
              >
                Retry failed ({failed.length})
              </Button>
            )}
            <Button
              variant="outline"
              disabled={saving || checking}
              onClick={() => setChangeSelection((v) => !v)}
            >
              {changeSelection ? "Done selecting" : "Change selection"}
            </Button>
            {saving && (
              <Button
                variant="outline"
                onClick={() => {
                  stop.current = true;
                }}
              >
                Stop import
              </Button>
            )}
            <Button
              variant="outline"
              disabled={saving || checking}
              onClick={() => {
                generation.current++;
                current.current = [];
                setGroups([]);
                setKnown(new Set());
                setOutcomes({});
                setStatus("Preview cleared. Your saved groups are unchanged.");
                setError("");
              }}
            >
              Clear preview
            </Button>
          </div>
          {changeSelection && (
            <Button
              variant="outline"
              disabled={saving || checking}
              onClick={() =>
                setSelected(
                  new Set(
                    groups
                      .filter((g) => !known.has(identity(g.url)))
                      .map((g) => g.url),
                  ),
                )
              }
            >
              Select all new groups
            </Button>
          )}
          <div className="collection-grid">
            {groups
              .filter((g) =>
                g.title.toLowerCase().includes(filter.toLowerCase()),
              )
              .map((group) => (
                <article className="collection-card" key={group.url}>
                  {changeSelection ? (
                    <label>
                      <input
                        type="checkbox"
                        checked={
                          selected.has(group.url) &&
                          !known.has(identity(group.url))
                        }
                        disabled={
                          saving || checking || known.has(identity(group.url))
                        }
                        onChange={(e) =>
                          setSelected((previous) => {
                            const next = new Set(previous);
                            if (e.target.checked) next.add(group.url);
                            else next.delete(group.url);
                            return next;
                          })
                        }
                      />
                      {group.title}
                    </label>
                  ) : (
                    <h4>{group.title}</h4>
                  )}
                  <span className="subtle-badge">
                    {outcomes[group.url] === "saved"
                      ? "Imported"
                      : outcomes[group.url] === "failed"
                        ? "Failed"
                        : known.has(identity(group.url))
                          ? "Already saved"
                          : checked
                            ? "New"
                            : "Not checked"}
                  </span>
                  <a
                    className="group-source"
                    href={group.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View on Facebook{" "}
                    <ExternalLink size={14} aria-hidden="true" />
                  </a>
                </article>
              ))}
          </div>
          {Object.keys(outcomes).length > 0 && (
            <p role="status" className="group-success">
              {imported} imported · {duplicates} already saved · {failed.length}{" "}
              failed.{" "}
              <a href="/dashboard/my-groups#saved-groups">View My Groups</a>
            </p>
          )}
          <p className="muted text-sm">
            Add destination and accommodation details later. Membership,
            activity and posting rules remain unverified.
          </p>
        </>
      )}
      {error && (
        <div role="alert" className="group-error">
          {error}
          {!checked && groups.length > 0 && (
            <Button
              variant="outline"
              disabled={checking || saving}
              onClick={() => void checkExisting(groups)}
            >
              Retry duplicate check
            </Button>
          )}
        </div>
      )}
      {status && (
        <p className="muted text-sm" aria-live="polite">
          {status}
        </p>
      )}
    </section>
  );
}
