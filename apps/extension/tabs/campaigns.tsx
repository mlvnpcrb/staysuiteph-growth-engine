import type { SavedGroup } from "@staysuite/types";
import { useEffect, useRef, useState } from "react";
import {
  campaignListSchema,
  groupResponseSchema,
  safeDashboardUrl,
  type CampaignJob,
  type CampaignList,
} from "@staysuite/validation";
import {
  campaignDashboard,
  campaignFacebookActor,
} from "../lib/campaign-dashboard";
import {
  classicPublisherPage,
  type ClassicPublishInput,
} from "../lib/classic-publisher";
import { executeCampaignTarget } from "../lib/campaign-executor";
import "../style.css";
type Connection = { tabId: number; origin: string; viewer: string };
export default function CampaignWorkspace() {
  const [groups, setGroups] = useState<SavedGroup[]>([]);
  const [url, setUrl] = useState(
    process.env.PLASMO_PUBLIC_DASHBOARD_URL || "http://localhost:3000",
  );
  const [connection, setConnection] = useState<Connection | null>(null),
    [list, setList] = useState<CampaignList | null>(null),
    [job, setJob] = useState<CampaignJob | null>(null);
  const [actor, setActor] = useState<{
      actor_id: string;
      actor_type: "personal";
    } | null>(null),
    [enabled, setEnabled] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [running, setRunning] = useState(false),
    [notice, setNotice] = useState(
      "Connect a signed-in StaySuite dashboard and your Facebook profile.",
    );
  const controller = useRef<AbortController | null>(null),
    activeFacebook = useRef<number | null>(null),
    pending = useRef(false);
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );
  const bridge = connection
    ? campaignDashboard(connection.tabId, connection.origin, connection.viewer)
    : null;
  function clearApproval() {
    setConfirmed(false);
  }
  async function readActor() {
    if (activeFacebook.current === null) {
      const tabs = await chrome.tabs.query({
        url: "https://www.facebook.com/*",
      });
      const tab = tabs.find(
        (t) => t.id !== undefined && t.status === "complete",
      );
      if (tab?.id === undefined)
        throw new Error(
          "Open Facebook and sign in to your personal profile, then reconnect.",
        );
      activeFacebook.current = tab.id;
    }
    const result = (
      await chrome.scripting.executeScript({
        target: { tabId: activeFacebook.current },
        world: "MAIN",
        func: campaignFacebookActor,
      })
    )[0]?.result;
    if (!result)
      throw new Error(
        "The Facebook profile could not be verified. Resolve any account check in Facebook.",
      );
    return result;
  }
  async function connect() {
    setBusy(true);
    setConnection(null);
    setList(null);
    setJob(null);
    setActor(null);
    setEnabled(false);
    clearApproval();
    try {
      const origin = safeDashboardUrl(url),
        host = new URL(origin);
      const pattern = `${host.protocol}//${host.hostname}/*`;
      if (
        !(await chrome.permissions.request({
          origins: [pattern, "https://www.facebook.com/*"],
        }))
      )
        throw new Error(
          "Allow this StaySuite site and Facebook to connect the campaign workspace.",
        );
      const tabs = await chrome.tabs.query({ url: pattern });
      const tab = tabs.find((t) => {
        try {
          const u = new URL(t.url || "");
          return u.origin === origin && u.pathname.startsWith("/dashboard/");
        } catch {
          return false;
        }
      });
      if (tab?.id === undefined)
        throw new Error(
          "Open the signed-in StaySuite dashboard in this Chrome profile first.",
        );
      const first = campaignDashboard(tab.id, origin, "");
      const campaigns = await first.list();
      const session = { tabId: tab.id, origin, viewer: campaigns.viewer_id };
      const publisher = await campaignDashboard(
        tab.id,
        origin,
        session.viewer,
      ).read("/api/campaigns/publisher");
      if (
        !publisher ||
        typeof publisher !== "object" ||
        !("viewer_id" in publisher) ||
        publisher.viewer_id !== session.viewer ||
        !("classic" in publisher) ||
        typeof publisher.classic !== "boolean"
      )
        throw new Error("Publisher response did not match your account.");
      activeFacebook.current = null;
      const identity = await readActor();
      const savedGroups = groupResponseSchema.parse(
        await campaignDashboard(tab.id, origin, session.viewer).read(
          "/api/groups",
        ),
      );
      if (savedGroups.viewer_id !== session.viewer)
        throw new Error("StaySuite account changed. Reconnect.");
      setGroups(savedGroups.groups ?? []);
      setActor(identity);
      setConnection(session);
      setList(campaignListSchema.parse(campaigns));
      setEnabled(publisher.classic);
      setNotice(
        publisher.classic
          ? "Connected. Review one exact campaign before starting."
          : "Connected. Automatic submission is disabled until this Facebook adapter passes live validation. You can inspect the composer without filling or publishing it.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not connect.");
    } finally {
      setBusy(false);
    }
  }
  async function open(id: string) {
    if (!bridge) return;
    setBusy(true);
    clearApproval();
    try {
      const current = await bridge.command({
        id,
        revision: 0,
        command: "inspect",
        payload: {},
      });
      setJob(current);
      setNotice("Review the exact text, media and ordered groups below.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Campaign unavailable.");
    } finally {
      setBusy(false);
    }
  }
  async function command(
    action: "bind_actor" | "approve" | "pause" | "cancel" | "recover",
  ) {
    if (!bridge || !job) return;
    setBusy(true);
    try {
      const identity = await readActor();
      if (identity.actor_id !== actor?.actor_id)
        throw new Error("Facebook identity changed. Reconnect.");
      const current = await bridge.command({
        id: job.id,
        revision: job.revision,
        command: action,
        payload:
          action === "bind_actor"
            ? identity
            : action === "approve"
              ? { digest: job.digest }
              : {},
      });
      setJob(current);
      clearApproval();
      setNotice(
        action === "approve"
          ? "This exact saved version is approved. Nothing has been published."
          : "Campaign updated. Review the current version.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Operation failed.");
    } finally {
      setBusy(false);
    }
  }
  async function destination(
    current: CampaignJob,
    target: CampaignJob["targets"][number],
  ) {
    if (!bridge || !connection) throw new Error("Reconnect StaySuite.");
    const result = groupResponseSchema.parse(await bridge.read("/api/groups"));
    if (result.viewer_id !== connection.viewer)
      throw new Error("StaySuite account changed. Reconnect.");
    const group = result.groups?.find((g) => g.id === target.group_id);
    if (
      !group ||
      !/^https:\/\/www\.facebook\.com\/groups\/[1-9]\d*\/$/.test(group.url)
    )
      throw new Error(
        "The target group is unavailable or has an unsupported URL.",
      );
    const tab = await chrome.tabs.create({ url: group.url, active: true });
    if (tab.id === undefined) throw new Error("Facebook tab unavailable.");
    activeFacebook.current = tab.id;
    const end = Date.now() + 20000;
    while ((await chrome.tabs.get(tab.id)).status !== "complete") {
      if (Date.now() > end || controller.current?.signal.aborted)
        throw new Error("Facebook page did not become ready.");
      await new Promise((r) => setTimeout(r, 250));
    }
    const identity = await readActor();
    if (
      identity.actor_id !== current.actor_id ||
      current.actor_type !== "personal"
    )
      throw new Error(
        "The selected Facebook identity changed. Nothing was sent.",
      );
    return { tabId: tab.id, group };
  }
  async function preflight() {
    if (!job || !actor || !bridge) return;
    setBusy(true);
    try {
      const target = job.targets[0];
      if (!target)
        throw new Error("Choose a campaign with at least one group.");
      const identity = await readActor();
      const checked = {
        ...job,
        actor_id: identity.actor_id,
        actor_type: identity.actor_type,
      };
      const { tabId, group } = await destination(checked, target);
      const result = (
        await chrome.scripting.executeScript({
          target: { tabId },
          world: "MAIN",
          func: classicPublisherPage,
          args: [
            {
              actorId: identity.actor_id,
              groupUrl: group.url,
              text: job.plan.text,
              attemptToken: crypto.randomUUID(),
              approvalDigest: job.digest,
              allowSubmit: false,
              media: [],
            },
          ],
        })
      )[0]?.result;
      setNotice(
        result?.outcome === "ready"
          ? "Facebook composer detected. No text was inserted and no post was sent. Actual media attachment and submission confirmation still require a live validation campaign."
          : `Composer check stopped: ${result?.code || "unavailable"}. No post was sent.`,
      );
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : "Composer check failed. Nothing was sent.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function publish(
    current: CampaignJob,
    target: CampaignJob["targets"][number],
  ) {
    if (
      !bridge ||
      !connection ||
      !enabled ||
      controller.current?.signal.aborted
    )
      throw new Error("Execution stopped.");
    const loaded = await bridge.restore(current.id);
    if (
      loaded.viewer_id !== connection.viewer ||
      loaded.job.digest !== current.digest
    )
      throw new Error("Campaign changed before dispatch.");
    if (
      current.plan.media.reduce((sum, m) => sum + m.size, 0) >
      20 * 1024 * 1024
    )
      throw new Error("Classic dispatch supports at most 20 MB per post.");
    const media: ClassicPublishInput["media"] = [];
    for (const saved of [...loaded.job.media].sort(
      (a, b) => a.position - b.position,
    )) {
      const signed = loaded.assets.find((a) => a.id === saved.id);
      if (!signed || !saved.uploaded)
        throw new Error("Missing private attachment.");
      const url = new URL(signed.url);
      if (
        url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["127.0.0.1", "localhost"].includes(url.hostname)
        )
      )
        throw new Error("Invalid private media URL.");
      const response = await fetch(url, {
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: controller.current?.signal ?? null,
      });
      if (!response.ok) throw new Error("Media could not be read.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length !== saved.manifest.size)
        throw new Error("Attachment size changed.");
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 16384)
        binary += String.fromCharCode(
          ...bytes.subarray(offset, offset + 16384),
        );
      media.push({
        name: saved.manifest.name,
        type: saved.manifest.type,
        base64: btoa(binary),
        sha256: saved.manifest.sha256,
      });
    }
    if (media.length !== current.plan.media.length)
      throw new Error("Attachment manifest incomplete.");
    const { tabId, group } = await destination(current, target);
    // Recheck cancellation, account and approval after downloads/navigation, before injection.
    const latest = await bridge.command({
      id: current.id,
      revision: 0,
      command: "inspect",
      payload: {},
    });
    if (
      controller.current?.signal.aborted ||
      latest.state !== "running" ||
      latest.digest !== current.digest ||
      latest.approved_digest !== current.approved_digest
    )
      throw new Error("Campaign changed before dispatch.");
    const response = (
      await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: classicPublisherPage,
        args: [
          {
            actorId: current.actor_id!,
            groupUrl: group.url,
            text: current.plan.text,
            attemptToken: target.attempt_token!,
            approvalDigest: current.digest,
            allowSubmit: true,
            media,
          },
        ],
      })
    )[0]?.result;
    if (!response)
      throw new Error("Facebook submission response was interrupted.");
    return response;
  }
  async function start() {
    if (!bridge || !job || !confirmed || !enabled || pending.current) return;
    pending.current = true;
    controller.current = new AbortController();
    setRunning(true);
    setBusy(true);
    clearApproval();
    try {
      const identity = await readActor();
      if (
        identity.actor_id !== actor?.actor_id ||
        job.actor_id !== identity.actor_id
      )
        throw new Error("Facebook profile changed. Reconnect.");
      let current = await bridge.command({
        id: job.id,
        revision: job.revision,
        command: job.state === "paused" ? "resume" : "start",
        payload: identity,
      });
      setJob(current);
      while (
        !controller.current.signal.aborted &&
        current.state === "running"
      ) {
        const publishers = await bridge.read("/api/campaigns/publisher");
        if (
          !publishers ||
          typeof publishers !== "object" ||
          !("classic" in publishers) ||
          publishers.classic !== true ||
          !("viewer_id" in publishers) ||
          publishers.viewer_id !== connection?.viewer
        )
          throw new Error(
            "Publisher validation is unavailable. Execution stopped.",
          );
        current = await executeCampaignTarget(
          { command: bridge.command, actor: readActor, publish },
          current.id,
        );
        setJob(current);
        if (current.state !== "running") break;
        setNotice(
          `Waiting for server eligibility. Keep this extension workspace and the StaySuite tab open. Next eligible: ${new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", timeStyle: "short" }).format(new Date(current.next_eligible_at))} (Asia/Manila).`,
        );
        const delay = Math.min(
          30000,
          Math.max(1000, Date.parse(current.next_eligible_at) - Date.now()),
        );
        await new Promise<void>((resolve) => {
          const signal = controller.current?.signal;
          const finish = () => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", finish);
            resolve();
          };
          const timer = setTimeout(finish, delay);
          signal?.addEventListener("abort", finish, { once: true });
        });
      }
      setNotice(current.stop_reason || `Campaign is ${current.state}.`);
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : "Execution interrupted. Check the queue before retrying.",
      );
    } finally {
      pending.current = false;
      setRunning(false);
      setBusy(false);
    }
  }
  async function stop() {
    controller.current?.abort();
    if (bridge && job) {
      try {
        const current = await bridge.command({
          id: job.id,
          revision: 0,
          command: "inspect",
          payload: {},
        });
        if (current.state === "running")
          setJob(
            await bridge.command({
              id: current.id,
              revision: current.revision,
              command: "pause",
              payload: {},
            }),
          );
      } catch {
        setNotice(
          "Stop requested. Check the saved queue before restarting; an in-flight submission may still finish.",
        );
      }
    }
  }
  return (
    <main className="groups-workspace campaign-extension">
      <header className="brand-header">
        <div className="brand">
          <span className="brand-icon">⌂</span>
          <div className="wordmark">
            StaySuite<small>Campaign workspace</small>
          </div>
        </div>
        <a href={chrome.runtime.getURL("tabs/groups.html")}>Group library</a>
      </header>
      <section className="intro">
        <h1>Your campaign, one group at a time.</h1>
        <p>
          Use your saved draft and your current Facebook profile. No automatic
          run starts without your exact approval and Start action.
        </p>
      </section>
      <section className="collect-panel">
        <h2>1. Connect your browser</h2>
        <label htmlFor="campaign-origin">StaySuite Preview URL</label>
        <input
          id="campaign-origin"
          type="url"
          value={url}
          disabled={busy || running}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button disabled={busy || running} onClick={() => void connect()}>
          Connect StaySuite and Facebook
        </button>
        {actor && <p>Facebook personal profile: {actor.actor_id}</p>}
        <p role="status" aria-live="polite">
          {notice}
        </p>
      </section>
      {list && (
        <section className="collect-panel">
          <h2>2. Choose a saved campaign</h2>
          {!list.campaigns.length && <p>Save a campaign in StaySuite first.</p>}
          {list.campaigns.map((c) => (
            <div key={c.id} className="campaign-extension-card">
              <strong>{c.title || c.plan.text.slice(0, 80)}</strong>
              <p>{c.state}</p>
              <button
                disabled={busy || running}
                className="secondary"
                onClick={() => void open(c.id)}
              >
                Review campaign
              </button>
            </div>
          ))}
        </section>
      )}
      {job && (
        <section className="collect-panel">
          <h2>3. Review this exact version</h2>
          <h3>{job.title || "Untitled campaign"}</h3>
          <p className="campaign-extension-text">{job.plan.text}</p>
          <p>
            {job.plan.media.length} attachment(s) · {job.targets.length}{" "}
            group(s) · minimum {job.plan.intervalMinutes} minutes between posts
          </p>
          <ul>
            {job.plan.media.map((m) => (
              <li key={m.sha256}>
                {m.name} · {(m.size / 1048576).toFixed(1)} MB
              </li>
            ))}
          </ul>
          <ol>
            {job.targets.map((t) => (
              <li key={t.id}>
                {groups.find((g) => g.id === t.group_id)?.title ||
                  "Unavailable group"}{" "}
                · {t.state} ·{" "}
                {groups.find((g) => g.id === t.group_id)?.url || t.group_id}
              </li>
            ))}
          </ol>
          <button
            className="secondary"
            disabled={busy || running}
            onClick={() => void preflight()}
          >
            Check Facebook composer — no publishing
          </button>
          <button
            className="secondary"
            disabled={busy || running || job.actor_id === actor?.actor_id}
            onClick={() => void command("bind_actor")}
          >
            Use connected Facebook profile
          </button>
          <label className="consent">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy || running}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I reviewed this exact text, media and group order, and each group
            permits this post.
          </label>
          <button
            disabled={
              busy ||
              running ||
              !confirmed ||
              !job.actor_id ||
              !["draft", "ready"].includes(job.state)
            }
            onClick={() => void command("approve")}
          >
            Approve saved campaign
          </button>
          <button
            disabled={
              busy ||
              running ||
              !confirmed ||
              !enabled ||
              job.settings.method !== "classic" ||
              !["ready", "paused"].includes(job.state) ||
              job.plan.media.reduce((sum, m) => sum + m.size, 0) >
                20 * 1024 * 1024
            }
            onClick={() => void start()}
          >
            Start sequential posting
          </button>
          {!enabled && (
            <p>
              Automatic publishing is locked: the Facebook adapter has not
              passed live validation. A composer check does not prove successful
              posting.
            </p>
          )}
          <p>
            Classic dispatch supports up to 20 MB total attachments. Keep this
            workspace and the signed-in StaySuite tab open during a run. Closing
            them stops processing; inspect the queue before restarting. Delays
            do not guarantee avoidance of restrictions.
          </p>
          <button
            className="secondary"
            disabled={!running}
            onClick={() => void stop()}
          >
            Stop after current submission
          </button>
          <button
            className="secondary"
            disabled={busy || running || job.state !== "running"}
            onClick={() => void command("pause")}
          >
            Pause saved run
          </button>
          <button
            className="secondary"
            disabled={busy || running}
            onClick={() => void command("recover")}
          >
            Check interrupted submission
          </button>
        </section>
      )}
    </main>
  );
}
