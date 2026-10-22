import { useState } from "react";
import {
  safeDashboardUrl,
  groupCollectionSchema,
  type GroupCollection,
} from "@staysuite/validation";
import { collectVisibleGroups } from "./lib/collect-visible-groups";
import { collectionError } from "./lib/collection-error";
import { sendToDashboard } from "./lib/send-to-dashboard";
import "./style.css";
export default function Popup() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [collection, setCollection] = useState<GroupCollection | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [recovery, setRecovery] = useState<"collect" | "send">("collect");
  function openDashboard() {
    try {
      const origin = safeDashboardUrl(
        process.env.PLASMO_PUBLIC_DASHBOARD_URL || "http://localhost:3000",
      );
      window.open(
        `${origin}/dashboard/my-groups`,
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
    setRecovery("collect");
    setError("");
    setBusy(true);
    setCollection(null);
    setStatus("");
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
          : collectionError(error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function sendSelected() {
    setRecovery("send");
    if (!collection || !selected.size) return;
    setSending(true);
    setError("");
    setStatus("");
    try {
      await sendToDashboard(
        {
          ...collection,
          groups: collection.groups.filter((g) => selected.has(g.url)),
        },
        process.env.PLASMO_PUBLIC_DASHBOARD_URL || "http://localhost:3000",
      );
      setStatus(
        "Groups received in My Groups. Review the new groups and choose Import. No destination is required.",
      );
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      const messages: Record<string, string> = {
        dashboard_permission_denied:
          "Dashboard access was not granted. Your selected groups are still here. Allow access to your configured StaySuite site to send them.",
        dashboard_not_ready:
          "StaySuite is not ready to receive. Sign in on the dashboard, open My Groups, and send again. Your selection has not been saved.",
        busy: "StaySuite is saving another batch. Wait for it to finish, then send again.",
        batch_limit:
          "StaySuite already has too many preview groups. Save and clear its current batch, then send again.",
        invalid_payload:
          "StaySuite rejected the collection format. Reload both the extension and dashboard.",
      };
      setError(
        messages[code] ??
          "Could not send groups to StaySuite. Check your configured dashboard URL and extension site permission. No import has been confirmed.",
      );
    } finally {
      setSending(false);
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
      <span className="badge">Connected group import · Experimental</span>
      <h1>Your communities, together.</h1>
      <p>
        Open Facebook’s Your Groups page in your own signed-in browser. Detect
        visible group names and links, select them, and send them directly to
        StaySuite.
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
        <button
          disabled={!consent || busy || sending}
          onClick={() => void collect()}
        >
          {busy ? "Collecting…" : "Collect visible groups"}
        </button>
      </section>
      {error && (
        <div role="alert">
          <p>{error}</p>
          {recovery === "collect" ? (
            <button
              className="secondary"
              disabled={!consent || busy || sending}
              onClick={() => void collect()}
            >
              Try collecting again
            </button>
          ) : (
            <button className="secondary" onClick={openDashboard}>
              Open dashboard
            </button>
          )}
          {recovery === "send" && collection && selected.size > 0 && (
            <button disabled={sending} onClick={() => void sendSelected()}>
              Try sending again
            </button>
          )}
          <details>
            <summary>Extension permission help</summary>
            <p>
              Allow access to your configured StaySuite site when Chrome asks.
              If collection is denied, reload the extension and your Facebook
              tab, then collect again.
            </p>
          </details>
        </div>
      )}
      {status && <p role="status">{status}</p>}
      {collection && (
        <section>
          <h2>{collection.groups.length} groups collected</h2>
          <p>
            Unverified list, not proof of membership. Uncheck anything you don’t
            want to import.
          </p>
          <ul className="collection-list">
            {collection.groups.map((group) => (
              <li key={group.url}>
                <label>
                  <input
                    disabled={sending}
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
          <button
            disabled={!selected.size || sending}
            onClick={() => void sendSelected()}
          >
            {sending
              ? "Sending to StaySuite…"
              : `Send ${selected.size} selected groups to StaySuite`}
          </button>
          <button
            className="secondary"
            disabled={!selected.size || sending}
            onClick={exportCollection}
          >
            Export {selected.size} selected groups
          </button>
          <button
            className="secondary"
            disabled={sending}
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
        Send or export before closing this popup; the list is not retained.
        Scroll Facebook yourself to load more groups. StaySuite deduplicates
        saved groups. Sign in only on your dashboard.
      </small>
    </main>
  );
}
