"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Download,
  Sparkles,
  SlidersHorizontal,
  Tags,
  Search,
  FileText,
} from "lucide-react";
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
  const [activeId, setActiveId] = useState("");
  const [sort, setSort] = useState("default");
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
      setActiveId(template.id);
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
      if (result?.template) setActiveId(result.template.id);
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
  const filtered = templates
    .filter((item) =>
      `${item.name} ${item.text}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "default"
        ? 0
        : sort === "name-asc"
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name),
    );
  const current = filtered.find((item) => item.id === activeId) ?? filtered[0];
  return (
    <section className="template-library reference-template-library">
      <h1 className="sr-only">Templates</h1>
      <div
        className="reference-library-switcher"
        aria-label="Template library view"
      >
        <button type="button" className="active" aria-pressed="true">
          Post Templates
        </button>
        <button
          type="button"
          disabled
          title="Group collections are not implemented yet"
        >
          Groups
        </button>
      </div>
      {editing === undefined && (
        <div className="gpp-tpl-actions-row">
          <button
            type="button"
            className="gpp-secondary"
            disabled={busy || !viewer}
            onClick={() => open(null)}
          >
            <Plus size={14} aria-hidden="true" />
            Create Template
          </button>
          <button
            type="button"
            className="gpp-secondary"
            disabled
            title="Importing posts from Facebook profiles is not implemented yet"
          >
            <Download size={14} aria-hidden="true" />
            Import from profile
          </button>
          <button
            type="button"
            className="gpp-secondary"
            disabled
            title="Starter packs are not implemented yet"
          >
            <Sparkles size={14} aria-hidden="true" />
            Starter packs
          </button>
          <details className="template-sort-menu">
            <summary className="gpp-secondary">
              <SlidersHorizontal size={14} aria-hidden="true" />
              Sort &amp; Filter
            </summary>
            <div>
              <label>
                Sort by
                <select
                  aria-label="Sort by"
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                >
                  <option value="default">Default</option>
                  <option value="name-asc">Name (A-Z)</option>
                  <option value="name-desc">Name (Z-A)</option>
                </select>
              </label>
            </div>
          </details>
          <button
            type="button"
            className="gpp-secondary"
            disabled
            title="Template categories are not implemented yet"
          >
            <Tags size={14} aria-hidden="true" />
            Categories
          </button>
        </div>
      )}
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
          <div className="reference-template-editor-heading">
            <h2>{editing ? "Edit Template" : "Create Template"}</h2>
            <span className="muted">{name.length}/50</span>
          </div>
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
      {editing === undefined &&
        !loading &&
        !error &&
        templates.length === 0 && (
          <p>
            No templates yet. Create a template to reuse your post text and
            media.
          </p>
        )}
      {editing === undefined && (
        <div className="templates-split-layout">
          <aside className="ts-sidebar">
            <label className="reference-template-search">
              <span className="sr-only">Search templates</span>
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                placeholder="Search templates..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <ul className="ts-tags-list">
              {filtered.map((template) => (
                <li key={template.id}>
                  <button
                    type="button"
                    className={current?.id === template.id ? "active" : ""}
                    aria-pressed={current?.id === template.id}
                    onClick={() => setActiveId(template.id)}
                  >
                    <FileText size={16} aria-hidden="true" />
                    <span>
                      <strong>{template.name}</strong>
                      <small>
                        {template.text.slice(0, 80) ||
                          `${template.assets.length} attachment(s)`}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {!!templates.length && !filtered.length && (
              <p>No matching templates.</p>
            )}
          </aside>
          <div className="ts-main">
            <div className="ts-preview-container">
              {current ? (
                <article className="reference-template-preview">
                  <h2>{current.name}</h2>
                  <p className="template-excerpt">{current.text}</p>
                  <ul className="reference-template-attachments">
                    {current.assets.map((asset) => (
                      <li key={asset.id}>
                        {asset.name}
                        {!asset.uploaded && " · Upload pending"}
                      </li>
                    ))}
                  </ul>
                  <p>
                    {current.assets.length} attachment(s)
                    {current.state !== "ready" ? ` · ${current.state}` : ""}
                  </p>
                  <div className="template-actions">
                    {current.state === "ready" && (
                      <Link href={`/dashboard/compose?template=${current.id}`}>
                        Use template
                      </Link>
                    )}
                    <Button
                      disabled={busy || current.state === "deleting"}
                      onClick={() => open(current)}
                    >
                      Edit
                    </Button>
                    <Button
                      disabled={busy || current.state !== "ready"}
                      onClick={() => void action(current, "duplicate")}
                    >
                      Duplicate
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() => void action(current, "delete")}
                    >
                      Delete
                    </Button>
                  </div>
                </article>
              ) : (
                <div className="reference-template-empty">
                  <FileText size={30} aria-hidden="true" />
                  <p>Select a template to preview it here.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
