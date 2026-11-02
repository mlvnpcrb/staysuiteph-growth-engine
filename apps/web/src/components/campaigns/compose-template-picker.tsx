"use client";
import { useEffect, useId, useRef, useState } from "react";
import { FolderOpen, X, Link2, ChevronDown } from "lucide-react";
import { templateListSchema, type PostTemplate } from "@staysuite/validation";
export function ComposeTemplatePicker({
  dirty,
  variant = "toolbar",
  viewer,
  disabled = false,
  onSelect,
}: {
  dirty: boolean;
  variant?: "source" | "toolbar";
  viewer: string;
  disabled?: boolean;
  onSelect: (id: string) => void;
}) {
  const titleId = useId(),
    dialogId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const currentViewer = useRef(viewer);
  currentViewer.current = viewer;
  const [dataOwner, setDataOwner] = useState("");
  useEffect(() => {
    request.current?.abort();
    setTemplates([]);
    setDataOwner("");
    setSearch("");
    setError("");
    dialog.current?.close();
    setIsOpen(false);
  }, [viewer]);
  useEffect(() => () => request.current?.abort(), []);
  const [templates, setTemplates] = useState<PostTemplate[]>([]),
    [search, setSearch] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  async function open() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    dialog.current?.showModal();
    setIsOpen(true);
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/templates", {
        cache: "no-store",
        signal: controller.signal,
        headers: { "x-staysuite-viewer": viewer },
      });
      const body: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          typeof body === "object" && body && "error" in body
            ? String(body.error)
            : "Templates are unavailable.",
        );
      if (controller.signal.aborted) return;
      const data = templateListSchema.parse(body);
      if (data.viewer_id !== viewer || currentViewer.current !== viewer)
        throw new Error(
          "Your account changed. Reopen Compose before selecting a template.",
        );
      setDataOwner(viewer);
      setTemplates(data.templates.filter((item) => item.state === "ready"));
    } catch (error) {
      if (controller.signal.aborted) return;
      setTemplates([]);
      setError(
        error instanceof Error ? error.message : "Templates are unavailable.",
      );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className={
          variant === "source"
            ? "template-input-wrapper"
            : "reference-template-trigger"
        }
        aria-haspopup="dialog"
        aria-controls={dialogId}
        aria-expanded={isOpen}
        disabled={disabled || !viewer}
        title={
          variant === "source" ? "Post saved templates" : "Fill from template"
        }
        onClick={() => void open()}
      >
        <FolderOpen size={15} aria-hidden="true" />
        <span>
          {variant === "source" ? "Post saved templates" : "Fill from template"}
        </span>
        {variant === "source" && <ChevronDown size={13} aria-hidden="true" />}
      </button>
      <dialog
        ref={dialog}
        className="reference-dialog"
        id={dialogId}
        aria-labelledby={titleId}
        onClose={() => {
          request.current?.abort();
          setIsOpen(false);
        }}
      >
        <header>
          <h2 id={titleId}>Post saved templates</h2>
          <button
            type="button"
            aria-label="Close templates"
            onClick={() => dialog.current?.close()}
          >
            <X size={18} />
          </button>
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
        {error && <p role="alert">{error}</p>}
        <ul className="reference-template-options">
          {(dataOwner === viewer ? templates : [])
            .filter((item) =>
              `${item.name} ${item.text}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      dirty &&
                      !window.confirm(
                        "Replace your current unsaved post and attachments with this template?",
                      )
                    )
                      return;
                    onSelect(item.id);
                    dialog.current?.close();
                  }}
                >
                  <strong>{item.name}</strong>
                  <span>{item.text.slice(0, 160)}</span>
                  <small>{item.assets.length} attachment(s)</small>
                </button>
              </li>
            ))}
        </ul>
        {!loading && !error && !templates.length && (
          <p>No saved templates yet. Create one in Templates.</p>
        )}
        <a href="/dashboard/templates">Manage templates</a>
      </dialog>
    </>
  );
}
export function ComposeLinkDialog({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  return (
    <>
      <button
        type="button"
        className="gpp-attach-btn"
        disabled={disabled}
        onClick={() => {
          setError("");
          setUrl("");
          dialog.current?.showModal();
        }}
      >
        <Link2 size={15} aria-hidden="true" />
        Link
      </button>
      <dialog
        ref={dialog}
        className="reference-dialog"
        aria-labelledby="compose-link-title"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            try {
              const parsed = new URL(url.trim());
              if (
                !["https:", "http:"].includes(parsed.protocol) ||
                parsed.username ||
                parsed.password
              )
                throw new Error();
              const next =
                value +
                (value && !value.endsWith("\n") ? "\n" : "") +
                parsed.href;
              if (next.length > 10000) {
                setError("Keep the post within 10,000 characters.");
                return;
              }
              onChange(next);
              dialog.current?.close();
            } catch {
              setError("Enter a full http or https link without credentials.");
            }
          }}
        >
          <header>
            <h2 id="compose-link-title">Add a link</h2>
            <button
              type="button"
              aria-label="Close link dialog"
              onClick={() => dialog.current?.close()}
            >
              <X size={18} />
            </button>
          </header>
          <label>
            Link URL
            <input
              autoFocus
              type="url"
              required
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://"
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <button type="submit" className="gpp-secondary">
            Insert link
          </button>
        </form>
      </dialog>
    </>
  );
}
