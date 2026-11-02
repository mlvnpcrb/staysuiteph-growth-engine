"use client";
import { nativeEngineRequest, isNativeSuite, suiteFetch } from "@staysuite/ui";
import { useEffect, useRef, useState } from "react";
import { SuiteLink as Link } from "@staysuite/ui";
import {
  radarScopeSchema,
  type RadarLead,
  type RadarSettings,
  type RadarQuery,
  type RadarCommand,
} from "@staysuite/validation";
import { useGroups } from "../groups/use-groups";
import { readRadar, radarCommand, radarQueryString } from "./radar-api";
import { RadarSettingsEditor } from "./radar-settings";
import { RadarLeadCard } from "./radar-lead-card";
export function RadarWorkspace() {
  const { groups, viewer, error: groupsError } = useGroups();
  const owner = useRef(viewer);
  owner.current = viewer;
  const [scopeOwner, setScopeOwner] = useState("");
  const [scope, setScope] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(true),
    [settings, setSettings] = useState<RadarSettings | null | undefined>(),
    [editorVersion, setEditorVersion] = useState(0),
    [leads, setLeads] = useState<RadarLead[]>([]),
    [nextCursor, setNextCursor] = useState<string | null>(null),
    [serverTime, setServerTime] = useState(""),
    [version, setVersion] = useState(0);
  const [filter, setFilter] = useState<Omit<RadarQuery, "scope">>({
      search: "",
      status: "all",
    }),
    [search, setSearch] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    setScopeOwner("");
    setScope("");
    setSettings(undefined);
    setLeads([]);
    setError("");
    setMessage("");
    setFilter({ search: "", status: "all" });
    setSearch("");
    if (!viewer) return;
    if (isNativeSuite()) {
      let active = true;
      void nativeEngineRequest("status")
        ?.then((result: unknown) => {
          if (
            !active ||
            !result ||
            typeof result !== "object" ||
            !("status" in result)
          )
            return;
          const status = result.status;
          if (
            !status ||
            typeof status !== "object" ||
            !("viewer_id" in status) ||
            status.viewer_id !== viewer ||
            !("actor_id" in status) ||
            typeof status.actor_id !== "string"
          )
            return;
          const parsed = radarScopeSchema.safeParse(
            `personal:${status.actor_id}`,
          );
          if (parsed.success) {
            setScopeOwner(viewer);
            setScope(parsed.data);
          }
        })
        .catch((error) => {
          if (active)
            setError(
              error instanceof Error
                ? error.message
                : "Connect Facebook first.",
            );
        });
      return () => {
        active = false;
      };
    }
    const params = new URLSearchParams(location.search);
    const pinned = params.get("viewer");
    if (pinned && pinned !== viewer) {
      setError(
        "Your StaySuite account changed. Reconnect the extension before opening this profile.",
      );
      return;
    }
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(`staysuite:radar-scope:${viewer}`);
    } catch {
      /* Storage is optional. */
    }
    const parsed = radarScopeSchema.safeParse(params.get("scope") ?? stored);
    if (parsed.success) {
      setScopeOwner(viewer);
      setScope(parsed.data);
      try {
        sessionStorage.setItem(`staysuite:radar-scope:${viewer}`, parsed.data);
      } catch {
        /* Storage is optional. */
      }
    }
  }, [viewer]);
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setFilter((value) =>
          value.search === search
            ? value
            : { ...value, search, cursor: undefined },
        ),
      250,
    );
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const token = ++generation.current;
    if (!scope || !viewer || scopeOwner !== viewer) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    if (!filter.cursor) setLeads([]);
    void readRadar({ scope, ...filter }, viewer, controller.signal)
      .then((data) => {
        if (controller.signal.aborted || generation.current !== token) return;
        setSettings((value) => (value === undefined ? data.settings : value));
        setLeads((previous) =>
          filter.cursor
            ? [
                ...previous,
                ...data.leads.filter(
                  (lead) => !previous.some((item) => item.id === lead.id),
                ),
              ]
            : data.leads,
        );
        setNextCursor(data.next_cursor);
        setServerTime(data.server_time);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Lead Radar could not be loaded.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [scope, viewer, scopeOwner, filter, version]);
  async function command(input: RadarCommand) {
    if (scopeOwner !== viewer || !viewer) {
      setError("Your account changed. Reconnect before continuing.");
      return null;
    }
    const activeViewer = viewer,
      activeScope = scope;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await radarCommand(input, viewer);
      if (owner.current !== activeViewer || input.scope !== activeScope)
        throw new Error("Your account changed. Reconnect before continuing.");
      return result;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Lead Radar could not save changes.",
      );
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function update(
    id: string,
    revision: number,
    changes: Extract<RadarCommand, { operation: "update_lead" }>["changes"],
  ) {
    const result = await command({
      operation: "update_lead",
      scope,
      id,
      revision,
      changes,
    });
    if (!result?.lead) return false;
    setLeads((rows) =>
      rows.map((lead) => (lead.id === id ? result.lead! : lead)),
    );
    setMessage("Lead saved.");
    return true;
  }
  async function reloadSettings() {
    if (
      !window.confirm(
        "Reload saved settings? Unsaved settings edits will be discarded.",
      )
    )
      return;
    setBusy(true);
    try {
      const data = await readRadar(
        { scope, search: "", status: "all" },
        viewer,
        new AbortController().signal,
      );
      if (owner.current !== viewer) return;
      setSettings(data.settings);
      setEditorVersion((value) => value + 1);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Settings could not be reloaded.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function exportInbox() {
    setBusy(true);
    setError("");
    try {
      const query = { scope, ...filter, cursor: undefined };
      const response = await suiteFetch(
        `/api/radar/export?${radarQueryString(query)}`,
        { cache: "no-store", headers: { "x-staysuite-viewer": viewer } },
      );
      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("text/csv")
      )
        throw new Error("Lead export could not be started.");
      const blob = await response.blob();
      if (owner.current !== viewer)
        throw new Error("Your account changed. Reload before exporting.");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "staysuite-leads.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lead export was interrupted.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="radar-workspace">
      <h1 className="sr-only">Lead Radar</h1>
      <header className="radar-header">
        <button
          type="button"
          className="radar-settings-trigger"
          aria-expanded={settingsOpen}
          aria-controls="radar-settings-panel"
          onClick={() => setSettingsOpen((value) => !value)}
        >
          <span className="reference-nav-fa" aria-hidden="true">
            {"\uf05b"}
          </span>
          <span>
            <span className="radar-title">
              Lead Radar <small>Settings</small>
            </span>
            <span className="muted">Keywords, groups and replies</span>
          </span>
          <span aria-hidden="true">⌄</span>
        </button>
        <button type="button" disabled title="Scanning is not connected">
          Scanning unavailable
        </button>
      </header>
      {groupsError && <p role="alert">{groupsError}</p>}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!scope || scopeOwner !== viewer ? (
        <div className="radar-connect">
          <h2>Connect your Facebook profile</h2>
          <p>
            Open the StaySuite extension, connect StaySuite and Facebook, then
            choose Open Lead Radar.
          </p>
          <Link href="/dashboard/my-groups">
            All groups and connection help
          </Link>
          <p className="muted">
            AI, automatic scanning and automatic replies are unavailable.
          </p>
        </div>
      ) : (
        <>
          <p className="radar-profile">Selected Facebook profile: {scope}.</p>
          <div id="radar-settings-panel" hidden={!settingsOpen}>
            {settings !== undefined && (
              <RadarSettingsEditor
                key={`${scope}:${editorVersion}`}
                settings={settings}
                groups={groups}
                busy={busy}
                onSave={async (input) => {
                  const result = await command({
                    operation: "save_settings",
                    scope,
                    revision: settings?.revision ?? 0,
                    settings: input,
                  });
                  if (result?.settings) {
                    setSettings(result.settings);
                    setEditorVersion((value) => value + 1);
                    setMessage("Settings saved. Scanning remains unavailable.");
                  } else
                    throw new Error(
                      "Settings were not saved. Your edits are preserved.",
                    );
                }}
              />
            )}
            <button
              type="button"
              className="gpp-secondary"
              disabled={busy || loading}
              onClick={() => void reloadSettings()}
            >
              Reload saved settings
            </button>
          </div>
          <div className="radar-toolbar">
            <div>
              <button
                type="button"
                className="gpp-secondary"
                disabled={busy || loading}
                onClick={() => void exportInbox()}
              >
                Export
              </button>
              <button
                type="button"
                className="gpp-secondary"
                disabled={busy || loading || !leads.length}
                onClick={() => {
                  if (
                    window.confirm(
                      "Clear this profile’s inbox through the displayed snapshot?",
                    )
                  )
                    void command({
                      operation: "clear",
                      scope,
                      before: serverTime,
                    }).then((result) => {
                      if (result) {
                        setFilter((value) => ({ ...value, cursor: undefined }));
                        setVersion((value) => value + 1);
                        setMessage("Inbox cleared.");
                      }
                    });
                }}
              >
                Clear All
              </button>
            </div>
            <div>
              <input
                type="search"
                aria-label="Search names or text"
                placeholder="Search names or text..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select
                aria-label="Lead status"
                value={filter.status}
                onChange={(event) =>
                  setFilter((value) => ({
                    ...value,
                    status: event.target.value as RadarQuery["status"],
                    cursor: undefined,
                  }))
                }
              >
                <option value="all">All Leads</option>
                <option value="unread">Unread Only</option>
                <option value="starred">Starred</option>
                <option value="read">Read</option>
              </select>
              <select
                aria-label="Lead keyword"
                value={filter.keyword ?? ""}
                onChange={(event) =>
                  setFilter((value) => ({
                    ...value,
                    keyword: event.target.value || undefined,
                    cursor: undefined,
                  }))
                }
              >
                <option value="">All Keywords</option>
                {[
                  ...new Set([
                    ...(settings?.keyword_rules.exact ?? []),
                    ...(settings?.keyword_rules.broad ?? []),
                  ]),
                ].map((keyword) => (
                  <option key={keyword} value={keyword}>
                    {keyword}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {loading && <p role="status">Loading leads…</p>}
          {!loading && !error && !leads.length && (
            <p className="radar-empty">
              No leads yet. Your saved settings and leads are kept. Automatic
              scanning is unavailable.
            </p>
          )}
          {leads.map((lead) => (
            <RadarLeadCard
              key={`${scope}:${lead.id}`}
              lead={lead}
              busy={busy}
              onChange={update}
              onDelete={() => {
                if (window.confirm("Delete this lead?"))
                  void command({
                    operation: "delete_lead",
                    scope,
                    id: lead.id,
                    revision: lead.revision,
                  }).then((result) => {
                    if (result)
                      setLeads((rows) =>
                        rows.filter((item) => item.id !== lead.id),
                      );
                  });
              }}
            />
          ))}
          {nextCursor && (
            <button
              type="button"
              className="gpp-secondary"
              disabled={busy || loading}
              onClick={() =>
                setFilter((value) => ({ ...value, cursor: nextCursor }))
              }
            >
              Load more
            </button>
          )}
          {error && (
            <button
              type="button"
              className="gpp-secondary"
              disabled={busy || loading}
              onClick={() => setVersion((value) => value + 1)}
            >
              Retry inbox
            </button>
          )}
        </>
      )}
    </section>
  );
}
