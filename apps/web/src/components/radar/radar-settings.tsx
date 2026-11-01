"use client";
import { useState } from "react";
import {
  radarSettingsInputSchema,
  type RadarSettings,
} from "@staysuite/validation";
import type { SavedGroup } from "@staysuite/types";
const words = (value: string) => [
  ...new Set(
    value
      .split(/[,\n]/)
      .map((term) => term.trim())
      .filter(Boolean),
  ),
];
export function RadarSettingsEditor({
  settings,
  groups,
  busy,
  onSave,
}: {
  settings: RadarSettings | null;
  groups: SavedGroup[];
  busy: boolean;
  onSave: (
    input: ReturnType<typeof radarSettingsInputSchema.parse>,
  ) => Promise<void>;
}) {
  const [tab, setTab] = useState("targeting"),
    [exact, setExact] = useState(
      settings?.keyword_rules.exact.join("\n") ?? "",
    ),
    [broad, setBroad] = useState(
      settings?.keyword_rules.broad.join("\n") ?? "",
    ),
    [negative, setNegative] = useState(
      settings?.keyword_rules.negative.join("\n") ?? "",
    ),
    [selected, setSelected] = useState(settings?.group_ids ?? []),
    [search, setSearch] = useState(""),
    [interval, setInterval] = useState(settings?.scan_interval ?? 30),
    [inPage, setInPage] = useState(settings?.in_page_notifications ?? true),
    [desktop, setDesktop] = useState(settings?.desktop_notifications ?? true),
    [error, setError] = useState("");
  const [preferences, setPreferences] = useState<
    RadarSettings["reply_preferences"]
  >(
    settings?.reply_preferences ?? {
      style: "helpful",
      selling: "soft",
      directness: "balanced",
      context: "",
    },
  );
  async function save() {
    setError("");
    try {
      const input = radarSettingsInputSchema.parse({
        group_ids: selected,
        keyword_rules: {
          exact: words(exact),
          broad: words(broad),
          negative: words(negative),
        },
        scan_interval: interval,
        in_page_notifications: inPage,
        desktop_notifications: desktop,
        reply_preferences: preferences,
      });
      await onSave(input);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Settings could not be saved.");
    }
  }
  const tabs = [
    ["targeting", "Targeting"],
    ["automation", "Automation"],
    ["replies", "AI replies"],
    ["connections", "Connections"],
  ] as const;
  return (
    <form
      className="radar-settings"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div
        role="tablist"
        aria-label="Lead Radar settings"
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const current = tabs.findIndex((item) => item[0] === tab);
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? tabs.length - 1
                : (current +
                    (event.key === "ArrowRight" ? 1 : -1) +
                    tabs.length) %
                  tabs.length;
          setTab(tabs[next]![0]);
          document.getElementById(`radar-tab-${tabs[next]![0]}`)?.focus();
        }}
      >
        {tabs.map(([id, label]) => (
          <button
            type="button"
            role="tab"
            key={id}
            id={`radar-tab-${id}`}
            aria-controls={`radar-panel-${id}`}
            aria-selected={tab === id}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <fieldset disabled={busy}>
        <div
          role="tabpanel"
          id="radar-panel-targeting"
          aria-labelledby="radar-tab-targeting"
          hidden={tab !== "targeting"}
        >
          <h2>Words that signal an opportunity</h2>
          <p className="muted">
            Separate phrases with commas or new lines. Any exact or broad phrase
            can match; exclusions always win.
          </p>
          <div className="radar-keywords">
            {(
              [
                ["Exact phrases", exact, setExact],
                ["Broad keywords", broad, setBroad],
                ["Negative keywords", negative, setNegative],
              ] as const
            ).map(([label, value, setValue]) => (
              <label key={label}>
                {label}
                <textarea
                  aria-label={label}
                  rows={2}
                  maxLength={6000}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            className="gpp-secondary"
            disabled
            title="AI is unavailable"
          >
            Suggest from AI Studio
          </button>
          <h2>Groups to watch</h2>
          <label>
            Search or select groups
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="radar-group-list">
            {groups
              .filter((group) =>
                group.title.toLowerCase().includes(search.toLowerCase()),
              )
              .map((group) => (
                <label key={group.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(group.id)}
                    disabled={
                      !selected.includes(group.id) && selected.length >= 250
                    }
                    onChange={(event) =>
                      setSelected((ids) =>
                        event.target.checked
                          ? [...ids, group.id]
                          : ids.filter((id) => id !== group.id),
                      )
                    }
                  />
                  {group.title}
                </label>
              ))}
          </div>
          <p className="muted">
            {selected.length} {selected.length === 1 ? "group" : "groups"}{" "}
            selected
          </p>
          <label>
            Scan Interval
            <select
              aria-label="Scan Interval"
              value={interval}
              onChange={(event) =>
                setInterval(Number(event.target.value) as 15 | 30 | 60)
              }
            >
              <option value={15}>15 minutes · Aggressive</option>
              <option value={30}>30 minutes · Balanced</option>
              <option value={60}>60 minutes · Safe</option>
            </select>
          </label>
          <p className="muted">
            Preferences are saved; automatic scanning is unavailable.
          </p>
          <label>
            <input
              type="checkbox"
              checked={inPage}
              onChange={(event) => setInPage(event.target.checked)}
            />
            In-page notifications
          </label>
          <label>
            <input
              type="checkbox"
              checked={desktop}
              onChange={(event) => setDesktop(event.target.checked)}
            />
            Desktop notifications
          </label>
        </div>
        <div
          role="tabpanel"
          id="radar-panel-automation"
          aria-labelledby="radar-tab-automation"
          hidden={tab !== "automation"}
        >
          <h2>Automation</h2>
          <p>
            Automatic scanning and comments are unavailable. Saving these
            settings does not start scanning or send replies.
          </p>
          <button type="button" className="gpp-secondary" disabled>
            Scan Now
          </button>
        </div>
        <div
          role="tabpanel"
          id="radar-panel-replies"
          aria-labelledby="radar-tab-replies"
          hidden={tab !== "replies"}
        >
          <h2>AI replies</h2>
          <p>AI qualification and reply generation are unavailable.</p>
          <label>
            Reply style
            <select
              aria-label="Reply style"
              value={preferences.style}
              onChange={(event) =>
                setPreferences((value) => ({
                  ...value,
                  style: event.target
                    .value as RadarSettings["reply_preferences"]["style"],
                }))
              }
            >
              <option value="helpful">Helpful</option>
              <option value="professional">Professional</option>
              <option value="conversational">Conversational</option>
            </select>
          </label>
          <label>
            Selling
            <select
              aria-label="Selling"
              value={preferences.selling}
              onChange={(event) =>
                setPreferences((value) => ({
                  ...value,
                  selling: event.target
                    .value as RadarSettings["reply_preferences"]["selling"],
                }))
              }
            >
              <option value="none">No selling</option>
              <option value="soft">Soft</option>
              <option value="direct">Direct</option>
            </select>
          </label>
          <label>
            Directness
            <select
              aria-label="Directness"
              value={preferences.directness}
              onChange={(event) =>
                setPreferences((value) => ({
                  ...value,
                  directness: event.target
                    .value as RadarSettings["reply_preferences"]["directness"],
                }))
              }
            >
              <option value="gentle">Gentle</option>
              <option value="balanced">Balanced</option>
              <option value="direct">Direct</option>
            </select>
          </label>
          <label>
            Reply context
            <textarea
              aria-label="Reply context"
              maxLength={400}
              rows={3}
              value={preferences.context}
              onChange={(event) =>
                setPreferences((value) => ({
                  ...value,
                  context: event.target.value,
                }))
              }
            />
          </label>
          <p className="muted">
            These preferences can be saved while AI is unavailable.
          </p>
        </div>
        <div
          role="tabpanel"
          id="radar-panel-connections"
          aria-labelledby="radar-tab-connections"
          hidden={tab !== "connections"}
        >
          <h2>Connections</h2>
          <p>Webhook delivery is unavailable.</p>
        </div>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <footer>
        <button className="gpp-secondary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save Settings"}
        </button>
      </footer>
    </form>
  );
}
