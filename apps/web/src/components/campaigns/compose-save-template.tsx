"use client";
import { suiteFetch } from "@staysuite/ui";
import { useEffect, useRef, useState } from "react";
import { Bookmark } from "lucide-react";
import {
  detectCampaignMediaType,
  templateContentSchema,
  type CampaignPlan,
  type PostTemplate,
} from "@staysuite/validation";
import {
  templateRequest,
  uploadTemplateAsset,
} from "../templates/template-api";
type Media = CampaignPlan["media"][number] & { preview: string };
export function ComposeSaveTemplate({
  text,
  media,
  viewer,
  disabled,
}: {
  text: string;
  media: readonly Media[];
  viewer: string;
  disabled: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    liveViewer = useRef(viewer);
  liveViewer.current = viewer;
  const [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const pending = useRef<{
    template: PostTemplate;
    files: { id: string; file: File }[];
    uploaded: Set<string>;
    owner: string;
  } | null>(null);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 6000);
    return () => clearTimeout(timer);
  }, [message]);
  const previousViewer = useRef(viewer);
  useEffect(() => {
    if (previousViewer.current !== viewer) {
      pending.current = null;
      setName("");
      setMessage("");
      setError("");
      dialog.current?.close();
    }
    previousViewer.current = viewer;
  }, [viewer]);
  async function save() {
    if (!viewer || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    const owner = viewer;
    const check = () => {
      if (!mounted.current)
        throw new Error("The Compose editor closed before saving finished.");
      if (liveViewer.current !== owner)
        throw new Error(
          "Your account changed. Reopen Compose before saving a template.",
        );
    };
    try {
      let work = pending.current;
      if (work && work.owner !== owner) work = null;
      if (!work) {
        const files: {
          id: string;
          file: File;
          asset: {
            id: string;
            name: string;
            content_type: Media["type"];
            size: number;
            sha256: string;
          };
        }[] = [];
        for (const asset of media) {
          const response = await suiteFetch(asset.preview);
          if (!response.ok)
            throw new Error(
              "An attachment changed. Select the original file again.",
            );
          const bytes = await response.arrayBuffer();
          const sha256 = Array.from(
            new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
            (value) => value.toString(16).padStart(2, "0"),
          ).join("");
          if (
            bytes.byteLength !== asset.size ||
            sha256 !== asset.sha256 ||
            detectCampaignMediaType(new Uint8Array(bytes)) !== asset.type
          )
            throw new Error("An attachment no longer matches this draft.");
          const id = crypto.randomUUID();
          files.push({
            id,
            file: new File([bytes], asset.name, { type: asset.type }),
            asset: {
              id,
              name: asset.name,
              content_type: asset.type,
              size: asset.size,
              sha256: asset.sha256,
            },
          });
        }
        check();
        const content = templateContentSchema.parse({
          name,
          text,
          assets: files.map((item) => item.asset),
        });
        const result = await templateRequest(
          { operation: "create", content },
          owner,
        );
        check();
        if (!result || result.viewer_id !== owner)
          throw new Error("Template save was not confirmed for this account.");
        work = {
          template: result.template,
          files: files.map(({ id, file }) => ({ id, file })),
          uploaded: new Set(),
          owner,
        };
        pending.current = work;
      }
      for (const item of work.files) {
        if (work.uploaded.has(item.id)) continue;
        check();
        const signed = await templateRequest(
          {
            operation: "upload",
            id: work.template.id,
            revision: work.template.revision,
            asset_id: item.id,
          },
          owner,
        );
        if (!signed?.upload || signed.viewer_id !== owner)
          throw new Error("The private upload was not confirmed.");
        await uploadTemplateAsset(signed.upload.signedUrl, item.file);
        work.uploaded.add(item.id);
      }
      check();
      if (work.template.assets.length) {
        const finalized = await templateRequest(
          {
            operation: "finalize",
            id: work.template.id,
            revision: work.template.revision,
          },
          owner,
        );
        check();
        if (!finalized || finalized.viewer_id !== owner)
          throw new Error("Template attachments were not finalized.");
        work.template = finalized.template;
      }
      setMessage(`Saved “${work.template.name}” in Templates.`);
      pending.current = null;
      dialog.current?.close();
    } catch (error) {
      if (mounted.current && liveViewer.current === owner)
        setError(
          error instanceof Error
            ? error.message
            : "Template save was not confirmed. Check Templates before retrying.",
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="toolbar-btn style-match-btn"
        disabled={
          disabled || busy || !viewer || (!text.trim() && !media.length)
        }
        title="Save as template"
        onClick={() => {
          setError("");
          if (!pending.current)
            setName(text.trim().split("\n")[0]?.slice(0, 50) || "New template");
          dialog.current?.showModal();
        }}
      >
        <Bookmark size={15} aria-hidden="true" />
        <span>Save</span>
      </button>
      {message && (
        <span className="compose-template-save-message" role="status">
          {message}
        </span>
      )}
      <dialog
        ref={dialog}
        className="reference-dialog"
        aria-labelledby="compose-save-template-title"
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <header>
          <h2 id="compose-save-template-title">Save as template</h2>
          <button
            type="button"
            aria-label="Close save template"
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label>
            Template name
            <input
              aria-label="Template name"
              required
              maxLength={50}
              value={name}
              disabled={busy || !!pending.current}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <p>
            {pending.current
              ? "Retry saves the captured template version. Your current Compose edits stay separate."
              : "Saves this text and its attachments to your private template library."}
          </p>
          {error && <p role="alert">{error}</p>}
          <button type="submit" className="gpp-secondary" disabled={busy}>
            {busy
              ? "Saving template…"
              : pending.current
                ? "Retry template save"
                : "Save template"}
          </button>
        </form>
      </dialog>
    </>
  );
}
