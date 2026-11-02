"use client";
import { SuiteLink } from "@staysuite/ui";
import { suiteFetch } from "@staysuite/ui";
import { useEffect, useState } from "react";
import {
  groupResponseSchema,
  type SavedGroupCollection,
} from "@staysuite/validation";
import type { useLibrary } from "./use-library";
import { csvCell } from "../../lib/activity-export";
type Group = { id: string; title: string; url: string };
export function CollectionLibrary({
  library,
  viewer,
}: {
  library: ReturnType<typeof useLibrary>;
  viewer: string;
}) {
  const [groups, setGroups] = useState<Group[]>([]),
    [editing, setEditing] = useState<SavedGroupCollection | null | undefined>(),
    [name, setName] = useState(""),
    [ids, setIds] = useState<string[]>([]),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    setGroups([]);
    setEditing(undefined);
    setError("");
    if (!viewer) return;
    const controller = new AbortController();
    void suiteFetch("/api/groups", {
      cache: "no-store",
      signal: controller.signal,
      headers: { "x-staysuite-viewer": viewer },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Saved groups could not be loaded.");
        const result = groupResponseSchema.parse(await response.json());
        if (result.viewer_id !== viewer)
          throw new Error("Your account changed. Reload before continuing.");
        if (!controller.signal.aborted) setGroups(result.groups ?? []);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Groups unavailable.");
      });
    return () => controller.abort();
  }, [viewer]);
  function open(collection: SavedGroupCollection | null) {
    setEditing(collection);
    setName(collection?.name ?? "");
    setIds(collection?.group_ids ?? []);
    setSearch("");
    setError("");
    setMessage("");
  }
  async function act(input: Parameters<typeof library.command>[0]) {
    setBusy(true);
    setError("");
    try {
      await library.command(input);
      setEditing(undefined);
      setMessage("Group collection saved.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Collection could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  function download(collection: SavedGroupCollection) {
    const rows = [
      ["Collection", "Group", "URL"],
      ...collection.group_ids.map((id) => {
        const group = groups.find((item) => item.id === id);
        return [collection.name, group?.title ?? "", group?.url ?? ""];
      }),
    ];
    const url = URL.createObjectURL(
      new Blob([rows.map((row) => row.map(csvCell).join(",")).join("\r\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "staysuite-group-collection.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="reference-collection-library">
      {error && <p role="alert">{error}</p>}
      {library.error && <p role="alert">{library.error}</p>}
      {message && <p role="status">{message}</p>}
      {editing === undefined ? (
        <>
          <button
            className="gpp-secondary"
            type="button"
            disabled={busy || !library.snapshot}
            onClick={() => open(null)}
          >
            Add a new group collection
          </button>
          {library.snapshot?.collections.length === 0 && (
            <p>No group collections yet.</p>
          )}
          <ul className="reference-collections-list">
            {library.snapshot?.collections.map((collection) => (
              <li key={collection.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => open(collection)}
                >
                  <strong>{collection.name}</strong>
                  <span>{collection.group_ids.length} groups</span>
                </button>
                <div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void act({
                        operation: "collection_duplicate",
                        id: collection.id,
                        revision: collection.revision,
                      })
                    }
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => download(collection)}
                  >
                    Export CSV
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete “${collection.name}”? Saved groups will be retained.`,
                        )
                      )
                        void act({
                          operation: "collection_delete",
                          id: collection.id,
                          revision: collection.revision,
                        });
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void act(
              editing
                ? {
                    operation: "collection_save",
                    id: editing.id,
                    revision: editing.revision,
                    name,
                    group_ids: ids,
                  }
                : { operation: "collection_create", name, group_ids: ids },
            );
          }}
        >
          <div className="reference-template-editor-heading">
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(undefined)}
            >
              Cancel
            </button>
            <button className="gpp-secondary" disabled={busy || !name.trim()}>
              Save Group Collection
            </button>
          </div>
          <label>
            Add a new group collection
            <input
              aria-label="Name of the group collection"
              placeholder="Name of the group collection"
              maxLength={100}
              required
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <input
            aria-label="Search tags & groups"
            placeholder="Search tags & groups"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="gpp-tpl-actions-row">
            <SuiteLink className="gpp-secondary" href="/dashboard/my-groups">
              Add a new link
            </SuiteLink>
            <button
              type="button"
              disabled={busy || !editing}
              onClick={() => {
                if (!editing) return;
                const value = window.prompt("Groups per collection", "25");
                if (value === null) return;
                const size = Number(value);
                if (!Number.isInteger(size) || size < 1 || size > 1000) {
                  setError("Enter a whole number from 1 to 1000.");
                  return;
                }
                if (
                  window.confirm(
                    "Split the saved collection? Unsaved edits are excluded.",
                  )
                )
                  void act({
                    operation: "collection_split",
                    id: editing.id,
                    revision: editing.revision,
                    size,
                  });
              }}
            >
              Split
            </button>
            <button type="button" disabled title="AI is unavailable">
              Segment by Niche
            </button>
          </div>
          <fieldset disabled={busy}>
            <legend>{ids.length} groups selected</legend>
            {groups
              .filter((group) =>
                `${group.title} ${group.url}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((group) => (
                <label key={group.id}>
                  <input
                    type="checkbox"
                    checked={ids.includes(group.id)}
                    onChange={(event) =>
                      setIds((current) =>
                        event.target.checked
                          ? [...current, group.id]
                          : current.filter((id) => id !== group.id),
                      )
                    }
                  />
                  {group.title}
                </label>
              ))}
          </fieldset>
        </form>
      )}
    </div>
  );
}
