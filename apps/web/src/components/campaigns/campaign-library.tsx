"use client";
import { useEffect, useState } from "react";
import { Button } from "@staysuite/ui";
import {
  campaignRestoreSchema,
  campaignDeleteReplySchema,
  campaignListSchema,
  detectCampaignMediaType,
  type CampaignJob,
  type CampaignList,
} from "@staysuite/validation";
export type RestoredCampaign = {
  job: CampaignJob;
  files: Blob[];
  viewer: string;
  duplicate: boolean;
};
export function CampaignLibrary({
  version,
  onOpen,
  onDeleted,
}: {
  version: number;
  onOpen: (value: RestoredCampaign) => void;
  onDeleted: (id: string) => void;
}) {
  const [list, setList] = useState<CampaignList | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0),
    [removing, setRemoving] = useState<string | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/campaigns", { cache: "no-store", signal: abort.signal })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok)
          throw new Error(
            "Saved campaigns are unavailable. Retry after reconnecting.",
          );
        if (!abort.signal.aborted) {
          setList(campaignListSchema.parse(body));
          setError("");
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setList(null);
          setError("Saved campaigns could not be loaded.");
        }
      });
    return () => abort.abort();
  }, [version, refresh]);
  async function open(id: string, duplicate: boolean) {
    if (!list) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/campaigns?id=${encodeURIComponent(id)}`,
        {
          cache: "no-store",
          headers: { "x-staysuite-viewer": list.viewer_id },
        },
      );
      if (!response.ok)
        throw new Error(
          "Could not reopen this campaign. Refresh your library.",
        );
      const data = campaignRestoreSchema.parse(await response.json());
      if (data.viewer_id !== list.viewer_id)
        throw new Error("Your account changed. Reload the page.");
      if (
        data.job.media.length !== data.job.plan.media.length ||
        data.job.media.some((m) => !m.uploaded)
      )
        throw new Error(
          "This campaign has incomplete uploads. Reopen it in its original tab to finish saving, or delete it and create a new draft.",
        );
      const files: Blob[] = [];
      for (const media of [...data.job.media].sort(
        (a, b) => a.position - b.position,
      )) {
        const asset = data.assets.find((a) => a.id === media.id);
        if (!asset) throw new Error("Saved attachment unavailable.");
        const url = new URL(asset.url);
        if (
          url.protocol !== "https:" &&
          !(
            url.protocol === "http:" &&
            ["127.0.0.1", "localhost"].includes(url.hostname)
          )
        )
          throw new Error("Attachment destination invalid.");
        const bytes = await fetch(url, {
          credentials: "omit",
          redirect: "error",
          referrerPolicy: "no-referrer",
        });
        if (!bytes.ok)
          throw new Error(
            "Saved attachment could not be retrieved. Retry to get a fresh link.",
          );
        const blob = await bytes.blob(),
          buffer = await blob.arrayBuffer();
        const hash = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
          (v) => v.toString(16).padStart(2, "0"),
        ).join("");
        if (
          blob.size !== media.manifest.size ||
          hash !== media.manifest.sha256 ||
          detectCampaignMediaType(new Uint8Array(buffer)) !==
            media.manifest.type
        )
          throw new Error(
            "Saved attachment did not match its approved manifest. Nothing was loaded.",
          );
        files.push(new Blob([buffer], { type: media.manifest.type }));
      }
      onOpen({ job: data.job, viewer: data.viewer_id, files, duplicate });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Campaign could not be opened.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string, revision: number) {
    if (!list) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/campaigns", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-staysuite-viewer": list.viewer_id,
        },
        body: JSON.stringify({ id, revision }),
      });
      const body: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          "Campaign was not fully deleted. Refresh the library and retry. Running or unresolved submissions must be stopped and reviewed first.",
        );
      const result = campaignDeleteReplySchema.parse(body);
      if (result.viewer_id !== list.viewer_id || result.deleted_id !== id)
        throw new Error("Your account changed. Reload the page.");
      onDeleted(id);
      setRemoving(null);
      setRefresh((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deletion failed.");
      setRefresh((v) => v + 1);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel campaign-library" aria-label="Saved campaigns">
      <div className="group-actions">
        <h2>Your saved campaigns</h2>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => setRefresh((v) => v + 1)}
        >
          Refresh library
        </Button>
      </div>
      <p className="muted">
        Reopen a saved draft, or duplicate it to change uploaded attachments.
        Nothing publishes from this library.
      </p>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Working with your private campaign…</p>}
      {list?.campaigns.length === 0 && (
        <p>No saved campaigns yet. Prepare and save your first draft below.</p>
      )}
      {list?.campaigns.map((c) => (
        <article key={c.id} className="campaign-library-item">
          <div>
            <h3>{c.title || c.plan.text.slice(0, 80)}</h3>
            <p className="muted">
              {c.state} ·{" "}
              {new Intl.DateTimeFormat("en-PH", {
                timeZone: "Asia/Manila",
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(c.created_at))}{" "}
              · Asia/Manila
            </p>
          </div>
          <div className="group-actions">
            <Button
              variant="outline"
              disabled={busy || c.state === "running"}
              onClick={() => void open(c.id, false)}
            >
              Open draft
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void open(c.id, true)}
            >
              Duplicate
            </Button>
            <Button
              variant="outline"
              disabled={busy || c.state === "running"}
              onClick={() => setRemoving(c.id)}
            >
              Delete
            </Button>
          </div>
          {removing === c.id && (
            <div role="group" aria-label="Confirm campaign deletion">
              <p>
                Delete this campaign and its uploaded files permanently? Your
                saved groups remain in My Groups.
              </p>
              <div className="group-actions">
                <Button
                  disabled={busy}
                  onClick={() => void remove(c.id, c.revision)}
                >
                  Delete campaign and files
                </Button>
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() => setRemoving(null)}
                >
                  Keep campaign
                </Button>
              </div>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
