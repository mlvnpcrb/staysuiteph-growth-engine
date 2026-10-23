import { useEffect, useRef, useState } from "react";
import { safeDashboardUrl } from "@staysuite/validation";
import { collectVisibleGroups } from "../lib/collect-visible-groups";
import { scanDirectory, scrollDirectory, type DirectoryGroup } from "../lib/directory-sync";
import { requestDashboard } from "../lib/workspace-dashboard";
import "../style.css";
const configured = process.env.PLASMO_PUBLIC_DASHBOARD_URL || "http://localhost:3000";
const origin = safeDashboardUrl(configured);
const appUrl = `${origin}/dashboard/my-groups`;
export default function GroupsWorkspace() {
  const [connection, setConnection] = useState<{ tabId: number; viewer: string } | null>(null);
  const [groups, setGroups] = useState<DirectoryGroup[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Connect StaySuite to begin. Sign in to Facebook in this browser.");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [consent, setConsent] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { document.documentElement.lang = "en"; document.title = "StaySuite · Sync groups"; return () => controller.current?.abort(); }, []);
  async function connect() {
    setError(""); setBusy(true); setConnection(null); setGroups([]);
    try {
      const url = new URL(origin);
      if (!await chrome.permissions.request({origins: ["https://www.facebook.com/*", `${url.protocol}//${url.hostname}/*`]})) throw new Error("Site access was declined. Connect when you are ready.");
      const tabs = await chrome.tabs.query({url: `${origin}/*`});
      const tab = tabs.find(item => item.url?.split("?")[0] === appUrl);
      if (!tab?.id) { await chrome.tabs.create({url: appUrl}); throw new Error("My Groups is opening. Sign in if needed, then click Connect again."); }
      const result = await requestDashboard(tab.id, origin);
      if (!result.viewer) throw new Error("StaySuite could not verify your account.");
      setConnection({tabId: tab.id, viewer: result.viewer}); setGroups(result.groups);
      setStatus("StaySuite connected. Keep Facebook’s joined-groups tab visible while syncing.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Connection failed. Open StaySuite and reconnect."); }
    finally { setBusy(false); }
  }
  async function sync() {
    if (!connection || !consent) return;
    setBusy(true); setError("");
    const abort = new AbortController(); controller.current = abort;
    try {
      const account = await requestDashboard(connection.tabId, origin, connection.viewer);
      if (account.viewer !== connection.viewer) throw new Error("Your StaySuite account changed. Reconnect before syncing.");
      const tabs = await chrome.tabs.query({url: "https://www.facebook.com/groups/*"});
      const tab = tabs.find(item => item.url && /^\/groups\/(joins|your_groups)\/?$/.test(new URL(item.url).pathname));
      if (!tab?.id) { await chrome.tabs.create({url: "https://www.facebook.com/groups/joins/"}); throw new Error("Facebook’s joined-groups page is opening. Let it load, then click Sync groups again."); }
      await chrome.tabs.update(tab.id, {active: true});
      if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, {focused: true});
      const tabId = tab.id;
      const result = await scanDirectory({
        read: async () => (await chrome.scripting.executeScript({target: {tabId}, func: collectVisibleGroups}))[0]?.result,
        scroll: async () => { const value = (await chrome.scripting.executeScript({target: {tabId}, func: scrollDirectory}))[0]?.result; if (!value) throw new Error("unavailable"); return value; },
        wait: () => new Promise(resolve => {
          const done = () => { clearTimeout(timer); abort.signal.removeEventListener("abort", done); resolve(); };
          const timer = setTimeout(done, 650); abort.signal.addEventListener("abort", done, {once:true});
          if (abort.signal.aborted) done();
        }),
        signal: abort.signal,
        progress: value => setStatus(`Found ${value.groups.length} groups · scanning the loaded directory…`),
      });
      if (result.reason === "blocked") throw new Error(result.message);
      if (result.reason === "cancelled") { setStatus("Sync cancelled. No collected groups were saved."); return; }
      let saved = 0;
      for (const group of result.groups) {
        if (abort.signal.aborted) break;
        await requestDashboard(connection.tabId, origin, connection.viewer, group);
        saved++; setStatus(`Saving ${saved} of ${result.groups.length} groups to StaySuite…`);
      }
      const latest = await requestDashboard(connection.tabId, origin, connection.viewer);
      setGroups(latest.groups);
      setStatus(`${saved} groups confirmed in StaySuite. ${abort.signal.aborted ? "Stopped after the current save." : result.reason === "loaded_end" ? "Reached the end of the loaded list." : "Stopped at the scan limit or a list that stopped loading."} Facebook may not expose every membership; this is a partial collection, not a verified account total.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sync stopped. Check Facebook and reconnect.");
      setStatus("Sync did not complete. Earlier confirmed saves remain in My Groups; retry safely without overwriting notes or rules.");
    } finally { setBusy(false); controller.current = null; }
  }
  const visible = groups.filter(group => group.title.toLowerCase().includes(query.toLowerCase()));
  return <main className="workspace">
    <header className="brand-header"><div className="brand"><span className="brand-icon" aria-hidden="true">S</span><div className="wordmark">StaySuite<small>Group companion</small></div></div><span className="badge">Sync workspace</span></header>
    <div className="intro"><h1>Your groups.<br/>Together in StaySuite.</h1><p>Connect once, then sync your joined-groups directory into My Groups.</p></div>
    <section className="collect-panel" aria-labelledby="connection"><h2 id="connection">Your connection</h2><p>{connection ? "StaySuite account verified for this session." : "Use your signed-in StaySuite and Facebook tabs."}</p><div className="workspace-actions"><button disabled={busy} onClick={() => void connect()}>{connection ? "Reconnect StaySuite" : "Connect workspace"}</button><a href={appUrl} target="_blank" rel="noreferrer">Open My Groups ↗</a><a href="https://www.facebook.com/groups/joins/" target="_blank" rel="noreferrer">Open Facebook ↗</a></div></section>
    <section className="collect-panel" aria-labelledby="sync"><h2 id="sync">Sync groups</h2><p>Keep Facebook’s joined-groups page visible. StaySuite scrolls that list and saves the group names and links it can see. No posts, member details or Facebook credentials are collected.</p><label className="consent"><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)}/>Save the collected groups to my connected StaySuite account.</label><div className="workspace-actions"><button disabled={busy || !connection || !consent} onClick={() => void sync()}>Sync groups</button>{busy && <button className="secondary" onClick={() => controller.current?.abort()} disabled={!controller.current}>Stop sync</button>}</div><p role="status" aria-live="polite">{status}</p>{error && <p className="workspace-error" role="alert">{error}</p>}</section>
    <section className="collect-panel" aria-labelledby="library"><div className="section-heading"><h2 id="library">Saved in My Groups</h2><span>{groups.length} groups</span></div><label className="search-label">Find a group<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search saved groups"/></label>{visible.length ? <ul className="workspace-list">{visible.map(group => <li key={group.url}><a href={group.url} target="_blank" rel="noreferrer">{group.title}</a><span>Saved in StaySuite</span></li>)}</ul> : <p>{connection ? "Your saved groups will appear here after syncing." : "Connect to load your account’s saved groups."}</p>}</section>
    <p>Experimental visible-page collection. Closing this window stops the scan. Group rules and marketing evidence still need your review in StaySuite.</p>
  </main>;
}
