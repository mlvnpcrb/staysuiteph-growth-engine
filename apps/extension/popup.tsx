import { useState } from "react";
import {
  safeDashboardUrl,
  groupCollectionSchema,
  type GroupCollection,
} from "@staysuite/validation";
import { collectVisibleGroups } from "./lib/collect-visible-groups";
import "./style.css";
export default function Popup() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [collection, setCollection] = useState<GroupCollection | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [consent, setConsent] = useState(false);
  function openDashboard() {
    try {
      const origin = safeDashboardUrl(
        process.env.PLASMO_PUBLIC_DASHBOARD_URL || "http://localhost:3000",
      );
      window.open(
        `${origin}/dashboard/group-finder`,
        "_blank",
        "noopener,noreferrer",
      );
    } catch {
      setError(
        "Dashboard URL is invalid. Contact your workspace administrator.",
      );
    }
  }
  async function collect() {
    setError("");
    setBusy(true);
    setCollection(null);
    try {
      if (typeof chrome === "undefined" || !chrome.scripting)
        throw new Error(
          "Install the unpacked Chrome extension to collect from your active tab.",
        );
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id)
        throw new Error("Select your Facebook Your Groups tab first.");
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: collectVisibleGroups,
        world: "ISOLATED",
      });
      const parsed = groupCollectionSchema.safeParse(result?.result);
      if (!parsed.success) {
        const raw: unknown = result?.result;
        if (
          raw &&
          typeof raw === "object" &&
          "error" in raw &&
          typeof raw.error === "string"
        )
          throw new Error(raw.error);
        throw new Error(
          "Could not read the joined-groups list. No data was sent.",
        );
      }
      setCollection(parsed.data);
      setSelected(new Set(parsed.data.groups.map((g) => g.url)));
    } catch (error) {
      // Chrome errors may contain page URLs. Show only our fixed categories/messages.
      const message = error instanceof Error ? error.message : "";
      setError(
        /^(Open Facebook|A dialog|The joined-groups|No visible group|Install the unpacked|Select your Facebook|Could not read)/.test(
          message,
        )
          ? message
          : "Collection was denied or unavailable. Open Your Groups, click the extension again, and check Facebook for restrictions.",
      );
    } finally {
      setBusy(false);
    }
  }
  function exportCollection() {
    if (!collection) return;
    const payload = {
      ...collection,
      groups: collection.groups.filter((g) => selected.has(g.url)),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "staysuite-groups.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <main>
      <span className="wordmark">StaySuite</span>
      <span className="badge">User-controlled collection · Experimental</span>
      <h1>Your communities, together.</h1>
      <p>
        Open Facebook’s Your Groups page. Collect only visible group names and
        links, then review your selection.
      </p>
      <a
        href="https://www.facebook.com/groups/joins/"
        target="_blank"
        rel="noopener noreferrer"
      >
        Open Your Groups ↗
      </a>
      <section>
        <label className="consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />{" "}
          I authorize reading the visible group names and links on this page.
        </label>
        <p>
          No posts, member lists, Facebook cookies or tokens are collected. No
          background access or publishing.
        </p>
        <button disabled={!consent || busy} onClick={() => void collect()}>
          {busy ? "Collecting…" : "Collect visible groups"}
        </button>
      </section>
      {error && <p role="alert">{error}</p>}
      {collection && (
        <section>
          <h2>{collection.groups.length} groups collected</h2>
          <p>
            Unverified list, not proof of membership. Uncheck anything you don’t
            want to export.
          </p>
          <ul className="collection-list">
            {collection.groups.map((group) => (
              <li key={group.url}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.has(group.url)}
                    onChange={(e) =>
                      setSelected((previous) => {
                        const next = new Set(previous);
                        if (e.target.checked) next.add(group.url);
                        else next.delete(group.url);
                        return next;
                      })
                    }
                  />
                  {group.title}
                </label>
              </li>
            ))}
          </ul>
          <button disabled={!selected.size} onClick={exportCollection}>
            Export {selected.size} selected groups
          </button>
          <button
            className="secondary"
            onClick={() => {
              setCollection(null);
              setSelected(new Set());
            }}
          >
            Clear collected list
          </button>
        </section>
      )}
      <button className="secondary" onClick={openDashboard}>
        Open dashboard ↗
      </button>
      <small>
        Export before closing this popup; the list is not retained. Scroll
        Facebook yourself and collect again to export another batch. Import
        files in Group Finder; repeated groups are deduplicated. Sign in only on
        your dashboard.
      </small>
    </main>
  );
}
