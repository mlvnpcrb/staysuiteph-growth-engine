"use client";
import { useId, useRef, useState, type ReactNode } from "react";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  ListOrdered,
  List,
  Smile,
  Shuffle,
  Undo2,
} from "lucide-react";
import { Button } from "@staysuite/ui";
import {
  preparePostVariation,
  transformPostText,
  type TextTool,
} from "./text-tools";
function Tool({
  label,
  help,
  children,
  onClick,
  unavailable = false,
}: {
  label: string;
  help: string;
  children: ReactNode;
  onClick: () => void;
  unavailable?: boolean;
}) {
  const id = useId();
  return (
    <span className="campaign-tool">
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        aria-disabled={unavailable || undefined}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
      >
        {children}
      </button>
      <span id={id} role="tooltip" className="campaign-tooltip">
        {help}
      </span>
    </span>
  );
}
export function CampaignTextEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (text: string) => void;
}) {
  const editor = useRef<HTMLTextAreaElement>(null);
  const selection = useRef({ start: 0, end: 0 });
  const [notice, setNotice] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [variationsOpen, setVariationsOpen] = useState(false);
  const [openings, setOpenings] = useState(
    "Hello everyone! 👋\nHi everyone!\nGood day!",
  );
  const [candidate, setCandidate] = useState<string | null>(null);
  const [variationBase, setVariationBase] = useState("");
  const [undo, setUndo] = useState<{ before: string; after: string } | null>(
    null,
  );
  function change(next: string, start = next.length, end = start) {
    if (next.length > 10000) {
      setNotice("Keep the post within 10,000 characters.");
      return;
    }
    setUndo({ before: value, after: next });
    onChange(next);
    requestAnimationFrame(() => {
      editor.current?.focus();
      editor.current?.setSelectionRange(start, end);
      selection.current = { start, end };
    });
  }
  function transform(tool: TextTool) {
    const result = transformPostText(
      value,
      selection.current.start,
      selection.current.end,
      tool,
    );
    if (result.text === value) {
      setNotice("Select the text you want to style first.");
      return;
    }
    change(result.text, result.start, result.end);
    setNotice("Text updated. Review the exact version before approval.");
  }
  function generate() {
    setVariationBase(value);
    setCandidate(preparePostVariation(value, openings));
  }
  return (
    <>
      <div
        className="campaign-editor-toolbar"
        role="toolbar"
        aria-label="Post text tools"
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
          const buttons = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
          );
          const current = buttons.findIndex(
            (button) => button === document.activeElement,
          );
          if (current < 0) return;
          event.preventDefault();
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? buttons.length - 1
                : (current +
                    (event.key === "ArrowRight" ? 1 : -1) +
                    buttons.length) %
                  buttons.length;
          buttons[next]?.focus();
        }}
      >
        <div className="campaign-text-tools">
          <Tool
            label="Bold lettering"
            help="Style selected letters using visible Unicode characters. Plain letters read best with screen readers."
            onClick={() => transform("bold")}
          >
            <Bold size={18} aria-hidden="true" />
          </Tool>
          <Tool
            label="Italic lettering"
            help="Style selected letters. This changes the actual characters in your post."
            onClick={() => transform("italic")}
          >
            <Italic size={18} aria-hidden="true" />
          </Tool>
          <Tool
            label="Heading 1 unavailable"
            unavailable
            help="Heading sizes are not supported by this text-only posting workflow."
            onClick={() =>
              setNotice(
                "Heading sizes are not connected. Your post text is unchanged.",
              )
            }
          >
            <Heading1 size={21} aria-hidden="true" />
          </Tool>
          <Tool
            label="Heading 2 unavailable"
            unavailable
            help="Heading sizes are not supported by this text-only posting workflow."
            onClick={() =>
              setNotice(
                "Heading sizes are not connected. Your post text is unchanged.",
              )
            }
          >
            <Heading2 size={21} aria-hidden="true" />
          </Tool>
          <Tool
            label="Numbered list"
            help="Add or remove numbered lines. The numbers are part of your post text."
            onClick={() => transform("numbers")}
          >
            <ListOrdered size={19} aria-hidden="true" />
          </Tool>
          <Tool
            label="Bullet list"
            help="Add or remove bullet points on the selected lines."
            onClick={() => transform("bullets")}
          >
            <List size={19} aria-hidden="true" />
          </Tool>
          <Tool
            label="Insert emoji"
            help="Choose an emoji to insert at the cursor."
            onClick={() => setEmojiOpen(!emojiOpen)}
          >
            <Smile size={19} aria-hidden="true" />
          </Tool>
          <Tool
            label="Undo text tool"
            help="Undo the last applied text tool or variation, before making further edits."
            unavailable={!undo || undo.after !== value}
            onClick={() => {
              if (undo?.after === value) {
                onChange(undo.before);
                setUndo(null);
                setNotice("Last text-tool change undone.");
              }
            }}
          >
            <Undo2 size={18} aria-hidden="true" />
          </Tool>
        </div>
        <button
          type="button"
          className="campaign-variation-toggle"
          aria-expanded={variationsOpen}
          aria-controls="campaign-variations"
          onClick={() => {
            setVariationsOpen(!variationsOpen);
            if (!variationsOpen) generate();
          }}
        >
          <Shuffle size={17} aria-hidden="true" />
          Random variations
        </button>
      </div>
      {emojiOpen && (
        <div
          className="campaign-emoji-picker"
          role="group"
          aria-label="Choose an emoji"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setEmojiOpen(false);
              editor.current?.focus();
            }
          }}
        >
          {[
            ["👋", "Wave"],
            ["🏡", "Home"],
            ["📍", "Location"],
            ["☀️", "Sun"],
            ["🌴", "Palm tree"],
            ["✨", "Sparkles"],
            ["📅", "Calendar"],
            ["💬", "Message"],
          ].map(([emoji, label]) => (
            <button
              key={emoji}
              type="button"
              aria-label={`Insert ${label} emoji`}
              onClick={() => {
                const { start, end } = selection.current;
                change(
                  value.slice(0, start) + emoji + value.slice(end),
                  start + emoji!.length,
                );
                setEmojiOpen(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
      <label htmlFor="campaign-text">Post text</label>
      <textarea
        ref={editor}
        id="campaign-text"
        className="campaign-post-editor"
        rows={9}
        maxLength={10000}
        value={value}
        onSelect={(event) => {
          selection.current = {
            start: event.currentTarget.selectionStart,
            end: event.currentTarget.selectionEnd,
          };
        }}
        onChange={(event) => {
          setUndo(null);
          onChange(event.target.value);
        }}
        placeholder="Describe your accommodation, location, dates and offer."
      />
      <div className="campaign-editor-meta">
        <span>{value.length.toLocaleString()}/10,000 characters</span>
        <span>Nothing is posted automatically</span>
      </div>
      {notice && (
        <p className="campaign-text-notice" aria-live="polite">
          {notice}
        </p>
      )}
      <details className="campaign-toolbar-help">
        <summary>Text tools help</summary>
        <p>
          Select text before using bold or italic lettering. These tools use
          stylized Unicode letters; plain letters are best for screen readers.
          Lists and emojis become visible post text. Heading sizes are not
          supported yet. Random variations add an opening line for you to
          review; they never post or change your offer automatically.
        </p>
      </details>
      {variationsOpen && (
        <section
          id="campaign-variations"
          className="campaign-variations"
          aria-label="Random variation preview"
        >
          <div>
            <h3>Try a different opening</h3>
            <p className="muted text-sm">
              Your full offer stays unchanged. Preview an opening, edit it if
              needed, then choose whether to use it. This does not publish
              anything.
            </p>
          </div>
          <label htmlFor="campaign-openings">
            Alternative opening lines, one per line
          </label>
          <textarea
            id="campaign-openings"
            rows={3}
            maxLength={1200}
            value={openings}
            onChange={(event) => {
              setOpenings(event.target.value);
              setCandidate(null);
            }}
          />
          <Button
            variant="outline"
            disabled={!value.trim() || !openings.trim()}
            onClick={generate}
          >
            Generate variation
          </Button>
          {candidate ? (
            <>
              <h4>Variation preview</h4>
              <p className="campaign-post-preview">{candidate}</p>
              {value !== variationBase && (
                <p className="muted">
                  Your draft changed. Generate a fresh preview before applying.
                </p>
              )}
              <Button
                disabled={value !== variationBase}
                onClick={() => {
                  change(candidate);
                  setVariationsOpen(false);
                  setNotice(
                    "Variation applied. Review and approve this exact version again.",
                  );
                }}
              >
                Use this variation
              </Button>
            </>
          ) : (
            <p className="muted">
              Write your post and add a short opening line to preview a
              variation. Keep the result within 10,000 characters.
            </p>
          )}
        </section>
      )}
    </>
  );
}
