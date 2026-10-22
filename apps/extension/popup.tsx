import { useEffect, useState } from "react";
import {
  safeDashboardUrl,
  groupCollectionSchema,
  type GroupCollection,
} from "@staysuite/validation";
import { collectVisibleGroups } from "./lib/collect-visible-groups";
import { collectionError } from "./lib/collection-error";
import { sendToDashboard } from "./lib/send-to-dashboard";
import { appendCollection, restoreCollectionDraft, BATCH_LIMIT } from "./lib/collection-batch";
import "./style.css";
const draftKey = "staysuite-group-batch-v1";
const dashboardUrl = process.env.PLASMO_PUBLIC_DASHBOARD_URL || "http://localhost:3000";
export default function Popup() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [collection, setCollection] = useState<GroupCollection | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [recovery, setRecovery] = useState<"collect" | "send">("collect");
  const [ready, setReady] = useState(false);
  const [storageNotice, setStorageNotice] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    document.documentElement.lang = "en";
    document.title = "StaySuite · Group companion";
    let active = true;
    async function restore() {
      try {
        if (typeof chrome === "undefined" || !chrome.storage?.session) {
          if (active) setStorageNotice("Temporary list: send or export before closing this popup.");
          return;
        }
        const data = await chrome.storage.session.get(draftKey);
        const restored = restoreCollectionDraft(data[draftKey], safeDashboardUrl(dashboardUrl));
        if (active && restored) {
          setCollection(restored.collection);
          setSelected(restored.selected);
        }
      } catch {
        if (active) setStorageNotice("Could not restore your batch. Collect again; no import was confirmed.");
      } finally {
        if (active) setReady(true);
      }
    }
    void restore();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!ready || typeof chrome === "undefined" || !chrome.storage?.session) return;
    async function save() {
      if (collection) await chrome.storage.session.set({ [draftKey]: {
          origin: safeDashboardUrl(dashboardUrl), collection,
          selected: [...selected], saved_at: Date.now(),
        } });
      else await chrome.storage.session.remove(draftKey);
    }
    void save().catch(() => setStorageNotice("Could not keep this batch. Send or export before closing the popup."));
  }, [collection, selected, ready]);
  const working = busy || sending || !ready;
  const visibleGroups = collection?.groups.filter(group =>
    group.title.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()),
  ) ?? [];
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
      const batch = appendCollection(collection, parsed.data, selected);
      setCollection(batch.collection);
      setSelected(batch.selected);
      setStatus(batch.overflow > 0
        ? `Batch full at ${BATCH_LIMIT} groups. Send or export this batch, then clear it to collect the next one.`
        : batch.added > 0
          ? `${batch.added} new ${batch.added === 1 ? "group" : "groups"} added. ${batch.collection.groups.length} in your batch.`
          : "No new groups on this screen. Scroll Facebook to a different part of your groups list, then add more.");
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
    <main className={collection ? "has-batch" : undefined}>
      <header className="brand-header">
        <div className="brand"><span className="brand-icon" aria-hidden="true">S</span><span className="wordmark">StaySuite<small>Group companion</small></span></div>
        <span className="badge">Experimental</span>
      </header>
      <div className="intro">
        <h1>{collection ? "Your group shortlist" : <>Bring your groups<br />to StaySuite.</>}</h1>
        <p>Build your shortlist from the groups you can see on Facebook.</p>
      </div>
      <nav className="steps" aria-label="Import steps">
        <span aria-current={!collection ? "step" : undefined}>1. Collect</span>
        <span aria-current={collection && !status.startsWith("Groups received") ? "step" : undefined}>2. Review</span>
        <span aria-current={status.startsWith("Groups received") ? "step" : undefined}>3. Send</span>
      </nav>
      <section className="collect-panel" aria-label="Collect from Facebook">
        <div className="section-heading"><h2>Start on Facebook</h2><a href="https://www.facebook.com/groups/joins/" target="_blank" rel="noopener noreferrer">Open Your Groups ↗</a></div>
        <p className="collection-help">Only groups visible on your screen are collected. Scroll Facebook yourself, reopen this popup, and add more. Your earlier groups stay in the batch.</p>
        <label className="consent">
          <input type="checkbox" checked={consent} disabled={working} onChange={e => setConsent(e.target.checked)} />
          <span>I authorize reading the visible group names and links on this page.</span>
        </label>
        <button disabled={!consent || working || (collection?.groups.length ?? 0) >= BATCH_LIMIT} onClick={() => void collect()}>
          {busy ? "Collecting…" : !ready ? "Restoring batch…" : collection ? "Add more visible groups" : "Collect visible groups"}
        </button>
        <p className="privacy">Names and links only. No background access or publishing.</p>
      </section>
      {error && <div className="notice error" role="alert">
        <strong>{recovery === "collect" ? "Collection needs attention" : "Delivery needs attention"}</strong><p>{error}</p>
        {recovery === "collect" ? <button className="secondary" disabled={!consent || working} onClick={() => void collect()}>Try collecting again</button>
          : <><button className="secondary" onClick={openDashboard}>Open dashboard to sign in</button><button disabled={working || !selected.size} onClick={() => void sendSelected()}>Try sending again</button></>}
      </div>}
      {status && <p className="notice" role="status">{status}</p>}
      {collection && <section className="review-panel" aria-label="Review collected groups">
        <div className="section-heading"><div><h2>{collection.groups.length} groups collected</h2><p>{selected.size} selected · up to {BATCH_LIMIT} per batch</p></div><button className="text-button" disabled={working} onClick={() => { setCollection(null); setSelected(new Set()); setStatus(""); setQuery(""); }}>Clear collected list</button></div>
        <p className="partial-note">This is a partial list, not all your joined groups. Names and membership are unverified.</p>
        <label className="search-label" htmlFor="group-search">Find in this batch</label>
        <input id="group-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search group names" />
        <div className="selection-tools"><button className="text-button" disabled={working} onClick={() => setSelected(new Set(collection.groups.map(g => g.url)))}>Select all</button><button className="text-button" disabled={working || !selected.size} onClick={() => setSelected(new Set())}>Deselect all</button></div>
        <ul className="collection-list" aria-label="Collected groups">
          {visibleGroups.map(group => <li key={group.url}><label><input type="checkbox" disabled={working} checked={selected.has(group.url)} onChange={e => setSelected(previous => { const next = new Set(previous); if(e.target.checked) next.add(group.url); else next.delete(group.url); return next; })} /><span>{group.title}<small>{new URL(group.url).pathname}</small></span></label></li>)}
        </ul>
        {!visibleGroups.length && <p>No group names match your search. Your selection is unchanged.</p>}
        <div className="send-actions">
          <button disabled={!selected.size || working} onClick={() => void sendSelected()}>{sending ? "Sending to StaySuite…" : `Send ${selected.size} selected groups to StaySuite`}</button>
          <button className="secondary" disabled={!selected.size || working} onClick={exportCollection}>Export {selected.size} selected groups</button>
          <p>Sending opens a review in My Groups. Choose Import there to save.</p>
        </div>
      </section>}
      <footer>
        <button className="secondary" onClick={openDashboard}>Open dashboard ↗</button>
        <details><summary>Connection & privacy</summary><p>No posts, private group content, member lists, Facebook cookies or tokens are collected. Sign in only on your dashboard.</p><p>Allow access only to your configured StaySuite site when Chrome asks. If collection is denied, reload the extension and Facebook tab.</p><p>Your group-name batch is kept in this browser session for up to four hours after your last use. Clear it any time above. No background collection runs.</p></details>
        {storageNotice && <p className="storage-notice">{storageNotice}</p>}
      </footer>
    </main>
  );
}
