"use client";
import { useState } from "react";
import type { RadarLead } from "@staysuite/validation";
export function RadarLeadCard({
  lead,
  busy,
  onChange,
  onDelete,
}: {
  lead: RadarLead;
  busy: boolean;
  onChange: (
    id: string,
    revision: number,
    changes: {
      stage?: RadarLead["stage"];
      is_read?: boolean;
      is_starred?: boolean;
      note?: string;
    },
  ) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false),
    [note, setNote] = useState(""),
    [revision, setRevision] = useState(lead.revision);
  const safeLink =
    /^https:\/\/www\.facebook\.com\/groups\/[A-Za-z0-9._-]{1,160}\/posts\/[1-9]\d{0,24}\/$/.test(
      lead.url,
    );
  return (
    <article className="radar-lead">
      <header>
        <div>
          <h2>{lead.author || "Facebook post"}</h2>
          <p className="muted">
            {lead.group_name} ·{" "}
            {new Intl.DateTimeFormat("en-PH", {
              timeZone: "Asia/Manila",
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(lead.discovered_at))}
          </p>
        </div>
        <button
          type="button"
          aria-label={`${lead.is_starred ? "Unstar" : "Star"} lead from ${lead.author || "Facebook post"}`}
          aria-pressed={lead.is_starred}
          disabled={busy}
          onClick={() =>
            void onChange(lead.id, lead.revision, {
              is_starred: !lead.is_starred,
            })
          }
        >
          {lead.is_starred ? "★" : "☆"}
        </button>
      </header>
      <p className="radar-lead-text">{lead.text}</p>
      <p className="radar-lead-keywords">{lead.matched_keywords.join(" · ")}</p>
      <div className="radar-lead-actions">
        <label>
          Stage
          <select
            aria-label={`Stage for ${lead.author || "Facebook post"}`}
            value={lead.stage}
            disabled={busy}
            onChange={(event) =>
              void onChange(lead.id, lead.revision, {
                stage: event.target.value as RadarLead["stage"],
              })
            }
          >
            {(
              ["new", "replied", "conversation", "customer", "closed"] as const
            ).map((stage) => (
              <option key={stage} value={stage}>
                {stage[0]!.toUpperCase() + stage.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void onChange(lead.id, lead.revision, { is_read: !lead.is_read })
          }
        >
          {lead.is_read ? "Mark unread" : "Mark read"}
        </button>
        {safeLink && (
          <a href={lead.url} target="_blank" rel="noopener noreferrer">
            Open post
          </a>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setNote(lead.note);
            setRevision(lead.revision);
            setEditing(true);
          }}
        >
          Edit note
        </button>
        <button type="button" disabled={busy} onClick={onDelete}>
          Delete lead
        </button>
      </div>
      {!editing && lead.note && <p className="radar-lead-note">{lead.note}</p>}
      {editing && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (await onChange(lead.id, revision, { note })) setEditing(false);
          }}
        >
          <label>
            Lead note
            <textarea
              aria-label="Lead note"
              maxLength={2000}
              value={note}
              disabled={busy}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <button type="submit" disabled={busy}>
            Save note
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </form>
      )}
    </article>
  );
}
