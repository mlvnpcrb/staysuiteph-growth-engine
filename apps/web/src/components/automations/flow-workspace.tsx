"use client";
import { useEffect, useRef, useState, lazy, Suspense } from "react";
import type { AutomationFlow } from "@staysuite/validation";
const FlowEditor = lazy(() =>
  import("./flow-editor").then((module) => ({ default: module.FlowEditor })),
);
import { flowCommand, readFlows } from "./flow-api";
const when = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila" })
    : "None";
export function FlowWorkspace() {
  const [flows, setFlows] = useState<AutomationFlow[]>([]),
    [viewer, setViewer] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0),
    [selected, setSelected] = useState<AutomationFlow | null>(null),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<
    Awaited<ReturnType<typeof readFlows>>["events"]
  >([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const owner = useRef("");
  const [editorDirty, setEditorDirty] = useState(false),
    [editorBusy, setEditorBusy] = useState(false);
  useEffect(() => {
    const refresh = () => setVersion((value) => value + 1);
    window.addEventListener("staysuite:groups-synced", refresh);
    return () => window.removeEventListener("staysuite:groups-synced", refresh);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void readFlows(undefined, undefined, false, controller.signal)
      .then((data) => {
        const pinned = new URLSearchParams(location.search).get("viewer");
        if (pinned && pinned !== data.viewer_id)
          throw new Error(
            "Your account changed. Reconnect the extension before opening Automations.",
          );
        if (!controller.signal.aborted) {
          if (owner.current && owner.current !== data.viewer_id) {
            dialog.current?.close();
            setOpen(false);
            setSelected(null);
            setHistory([]);
          }
          owner.current = data.viewer_id;
          setFlows(data.flows);
          setViewer(data.viewer_id);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          owner.current = "";
          dialog.current?.close();
          setOpen(false);
          setSelected(null);
          setHistory([]);
          setFlows([]);
          setViewer("");
          setError(
            error instanceof Error
              ? error.message
              : "Automations could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [version]);
  function edit(flow: AutomationFlow | null) {
    setSelected(flow);
    setEditorDirty(false);
    setEditorBusy(false);
    setOpen(true);
    dialog.current?.showModal();
  }
  function close() {
    if (editorBusy) return;
    if (editorDirty && !window.confirm("Discard unsaved automation changes?"))
      return;
    dialog.current?.close();
    setOpen(false);
  }
  function saved(flow: AutomationFlow) {
    if (flow.user_id !== owner.current) return;
    setFlows((items) => [flow, ...items.filter((item) => item.id !== flow.id)]);
  }
  async function action(flow: AutomationFlow, operation: "pause" | "delete") {
    if (
      operation === "delete" &&
      !window.confirm(
        "Delete this automation? Saved posts and recorded outcomes will be kept.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const result = await flowCommand(
        { operation, id: flow.id, revision: flow.revision },
        viewer,
      );
      if (result.flow) saved(result.flow);
      else if (owner.current === viewer)
        setFlows((items) => items.filter((item) => item.id !== flow.id));
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Automation operation failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function loadHistory() {
    setBusy(true);
    setError("");
    try {
      const result = await readFlows(viewer, undefined, true);
      if (owner.current === viewer) setHistory(result.events);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "History could not be loaded.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="flow-workspace" aria-labelledby="flow-workspace-title">
      <header>
        <h2 id="flow-workspace-title">Automation flows</h2>
        <span>{flows.length} saved</span>
        <div className="flow-actions">
          <button
            type="button"
            className="gpp-secondary"
            disabled={loading || busy}
            onClick={() => setVersion((value) => value + 1)}
          >
            Refresh flows
          </button>
          <button
            type="button"
            className="gpp-secondary"
            disabled={loading || !viewer}
            onClick={() => edit(null)}
          >
            Create automation flow
          </button>
        </div>
      </header>
      {loading && <p role="status">Loading flows…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && viewer && !flows.length && (
        <p>
          Build an ordered Trigger → Post → Wait → Loop → Stop flow. New flows
          stay paused until reviewed.
        </p>
      )}
      <div className="automation-list">
        {flows.map((flow) => (
          <article key={flow.id}>
            <div>
              <h3>{flow.title}</h3>
              <p>
                {flow.state} · {flow.definition.steps.length} steps · cycle{" "}
                {flow.cycle}
              </p>
              <p>Next step: {when(flow.next_action_at)}</p>
              {flow.stop_reason && <p>{flow.stop_reason}</p>}
            </div>
            <div className="automation-card-actions">
              <button
                type="button"
                className="gpp-secondary"
                disabled={busy}
                onClick={() => edit(flow)}
              >
                Open flow
              </button>
              <button
                type="button"
                className="gpp-secondary"
                disabled={busy || flow.state !== "enabled"}
                onClick={() => void action(flow, "pause")}
              >
                Pause flow
              </button>
              <button
                type="button"
                className="gpp-secondary"
                disabled={busy || flow.state === "enabled"}
                onClick={() => void action(flow, "delete")}
              >
                Delete flow
              </button>
            </div>
          </article>
        ))}
      </div>
      {viewer && (
        <details>
          <summary>Flow history</summary>
          <button
            type="button"
            className="gpp-secondary"
            disabled={busy}
            onClick={() => void loadHistory()}
          >
            Load flow history
          </button>
          <ol className="flow-history">
            {history.map((event) => (
              <li key={event.id}>
                <time dateTime={event.created_at}>
                  {when(event.created_at)}
                </time>
                <strong>{event.flow_title}</strong>
                <span>
                  {event.kind === "post_started"
                    ? "Post queued"
                    : event.kind.replaceAll("_", " ")}
                </span>
              </li>
            ))}
          </ol>
          <p>
            Queued means eligible for the extension, not published. Submission
            receipts are recorded separately; a completed run may include posts
            awaiting admin approval.
          </p>
        </details>
      )}
      <dialog
        ref={dialog}
        className="reference-dialog flow-dialog"
        aria-labelledby="flow-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <header>
          <h2 id="flow-dialog-title">
            {selected ? "Edit automation" : "Create automation"}
          </h2>
          <button
            type="button"
            aria-label="Close flow editor"
            disabled={editorBusy}
            onClick={close}
          >
            ×
          </button>
        </header>
        {open && viewer && (
          <Suspense fallback={<p role="status">Loading flow editor…</p>}>
            <FlowEditor
              key={selected?.id ?? "new"}
              initial={selected}
              viewer={viewer}
              onSaved={saved}
              onDirtyChange={setEditorDirty}
              onBusyChange={setEditorBusy}
            />
          </Suspense>
        )}
      </dialog>
    </section>
  );
}
