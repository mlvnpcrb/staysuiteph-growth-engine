"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@staysuite/ui";
import {
  templateListSchema,
  templateContentSchema,
  detectCampaignMediaType,
  TEMPLATE_MEDIA_LIMIT,
  type PostTemplate,
  type TemplateContent,
} from "@staysuite/validation";
import { templateRequest, uploadTemplateAsset } from "./template-api";
export function TemplateLibrary() {
  const account = useRef("");
  const [templates, setTemplates] = useState<PostTemplate[]>([]);
  const [viewer, setViewer] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<PostTemplate | null | undefined>(
    undefined,
  );
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [kept, setKept] = useState<PostTemplate["assets"]>([]);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void fetch("/api/templates", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok)
          throw new Error(
            typeof body === "object" && body && "error" in body
              ? String(body.error)
              : "Templates could not be loaded.",
          );
        const data = templateListSchema.parse(body);
        if (!controller.signal.aborted) {
          if (account.current && account.current !== data.viewer_id) {
            setEditing(undefined);
            setName("");
            setText("");
            setKept([]);
            setFiles([]);
            setMessage("");
            setError(
              "Your StaySuite account changed. Reopen the template to continue.",
            );
          }
          account.current = data.viewer_id;
          setTemplates(data.templates);
          setViewer(data.viewer_id);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setViewer("");
          setTemplates([]);
          setError(
            e instanceof Error ? e.message : "Templates could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [version]);
  function open(template: PostTemplate | null) {
    setEditing(template);
    setName(template?.name ?? "");
    setText(template?.text ?? "");
    setKept(template?.assets ?? []);
    setFiles([]);
    setError("");
    setMessage("");
  }
  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const pending: {
        asset: TemplateContent["assets"][number];
        file: File;
      }[] = [];
      if (kept.length + files.length > 10)
        throw new Error("Choose up to 10 attachments.");
      for (const file of files) {
        if (!file.size || file.size > TEMPLATE_MEDIA_LIMIT)
          throw new Error("Each attachment must be between 1 byte and 35 MB.");
        const bytes = await file.arrayBuffer();
        const content_type = detectCampaignMediaType(
          new Uint8Array(bytes).subarray(0, 256),
        );
        if (!content_type)
          throw new Error("Choose a recognized image or video file.");
        const sha256 = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          (v) => v.toString(16).padStart(2, "0"),
        ).join("");
        pending.push({
          file,
          asset: {
            id: crypto.randomUUID(),
            name: file.name,
            content_type,
            size: file.size,
            sha256,
          },
        });
      }
      const content = templateContentSchema.parse({
        name,
        text,
        assets: [
          ...kept.map(({ id, name, content_type, size, sha256 }) => ({
            id,
            name,
            content_type,
            size,
            sha256,
          })),
          ...pending.map((item) => item.asset),
        ],
      });
      const result = await templateRequest(
        editing
          ? {
              operation: "save",
              id: editing.id,
              revision: editing.revision,
              content,
            }
          : { operation: "create", content },
        viewer,
      );
      if (!result) throw new Error("Template was not saved.");
      let template = result.template;
      setEditing(template);
      setKept(template.assets);
      setFiles([]);
      for (const item of pending) {
        const signed = await templateRequest(
          {
            operation: "upload",
            id: template.id,
            revision: template.revision,
            asset_id: item.asset.id,
          },
          viewer,
        );
        if (!signed?.upload)
          throw new Error("Upload destination was not returned.");
        await uploadTemplateAsset(signed.upload.signedUrl, item.file);
      }
      if (template.assets.length) {
        const finalized = await templateRequest(
          {
            operation: "finalize",
            id: template.id,
            revision: template.revision,
          },
          viewer,
        );
        if (!finalized) throw new Error("Attachments were not finalized.");
        template = finalized.template;
      }
      setEditing(undefined);
      setMessage(result.warning ?? `Saved “${template.name}”.`);
      setVersion((value) => value + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Template could not be saved.");
      setVersion((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }
  async function action(
    template: PostTemplate,
    operation: "duplicate" | "delete",
  ) {
    if (operation === "delete" && !window.confirm(`Delete “${template.name}”?`))
      return;
    setBusy(true);
    setError("");
    try {
      const result = await templateRequest(
        {
          ...(operation === "duplicate" ? { operation } : {}),
          id: template.id,
          revision: template.revision,
        },
        viewer,
        operation === "delete" ? "DELETE" : "POST",
      );
      setMessage(
        result?.warning ??
          (operation === "delete"
            ? "Template deleted."
            : "Template duplicated."),
      );
      setVersion((value) => value + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Template operation failed.");
      setVersion((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="template-library">
      <header className="section-heading">
        <div>
          <h1>Templates</h1>
          <p>Save posts and media for reuse.</p>
        </div>
        <Button disabled={busy || !viewer} onClick={() => open(null)}>
          New template
        </Button>
      </header>
      <label>
        Search templates
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {loading && <p role="status">Loading templates…</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <Button
            disabled={busy}
            onClick={() => {
              setError("");
              setVersion((value) => value + 1);
            }}
          >
            Reload templates
          </Button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {editing !== undefined && (
        <form
          className="template-editor"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <h2>{editing ? "Edit template" : "New template"}</h2>
          <label>
            Template name
            <input
              required
              maxLength={50}
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Post text
            <textarea
              aria-label="Post text"
              rows={8}
              maxLength={12000}
              value={text}
              disabled={busy}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          <ul>
            {kept.map((asset) => (
              <li key={asset.id}>
                {asset.name} {!asset.uploaded && "(upload pending)"}{" "}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    setKept((items) =>
                      items.filter((item) => item.id !== asset.id),
                    )
                  }
                >
                  Remove {asset.name}
                </button>
              </li>
            ))}
          </ul>
          <label>
            Attachments
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
              disabled={busy}
              onChange={(event) =>
                setFiles(Array.from(event.target.files ?? []))
              }
            />
          </label>
          <p>Up to 10 attachments, 35 MB each.</p>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save template"}
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => setEditing(undefined)}
          >
            Cancel
          </Button>
        </form>
      )}
      {!loading && !error && templates.length === 0 && (
        <p>
          No templates yet. Create a template to reuse your post text and media.
        </p>
      )}
      <ul className="template-grid">
        {templates
          .filter((item) =>
            `${item.name} ${item.text}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .map((template) => (
            <li key={template.id} className="template-card">
              <h2>{template.name}</h2>
              <p className="template-excerpt">{template.text}</p>
              <p>
                {template.assets.length} attachment(s)
                {template.state !== "ready" ? ` · ${template.state}` : ""}
              </p>
              <div className="template-actions">
                {template.state === "ready" && (
                  <Link href={`/dashboard/compose?template=${template.id}`}>
                    Use template
                  </Link>
                )}
                <Button
                  disabled={busy || template.state === "deleting"}
                  onClick={() => open(template)}
                >
                  Edit
                </Button>
                <Button
                  disabled={busy || template.state !== "ready"}
                  onClick={() => void action(template, "duplicate")}
                >
                  Duplicate
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => void action(template, "delete")}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
      </ul>
    </section>
  );
}
