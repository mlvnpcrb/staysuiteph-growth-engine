"use client";
import { useEffect, useRef, useState } from "react";
import type { useLibrary } from "./use-library";
export function CategoryManager({
  library,
  onClose,
  onChange,
}: {
  library: ReturnType<typeof useLibrary>;
  onClose: () => void;
  onChange: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function act(input: Parameters<typeof library.command>[0]) {
    setBusy(true);
    setError("");
    try {
      await library.command(input);
      setName("");
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Category could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="reference-library-dialog"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
      aria-labelledby="category-heading"
    >
      <div className="reference-template-editor-heading">
        <h2 id="category-heading">Manage Categories</h2>
        <button
          type="button"
          aria-label="Close categories"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {library.snapshot?.categories.length === 0 && <p>No categories yet.</p>}
      <ul>
        {library.snapshot?.categories.map((category) => (
          <li key={category.id}>
            <span>{category.name}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const next = window.prompt("Category Name", category.name);
                if (next !== null)
                  void act({
                    operation: "category_rename",
                    id: category.id,
                    revision: category.revision,
                    name: next,
                  });
              }}
            >
              Rename
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    `Delete “${category.name}”? Templates will be retained.`,
                  )
                )
                  void act({
                    operation: "category_delete",
                    id: category.id,
                    revision: category.revision,
                  });
              }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void act({ operation: "category_create", name });
        }}
      >
        <label>
          Add New Category
          <input
            aria-label="Category Name"
            placeholder="Category Name"
            maxLength={25}
            required
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button className="gpp-secondary" disabled={busy || !name.trim()}>
          Add
        </button>
      </form>
      <button
        type="button"
        className="gpp-secondary"
        disabled={busy}
        onClick={onClose}
      >
        Done
      </button>
    </dialog>
  );
}
