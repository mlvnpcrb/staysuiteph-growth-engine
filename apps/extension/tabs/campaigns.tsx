import type { SavedGroup } from "@staysuite/types";
import { useEffect, useRef, useState } from "react";
import {
  campaignListSchema,
  groupResponseSchema,
  type CampaignJob,
  type CampaignList,
} from "@staysuite/validation";
import {
  campaignDashboardOrigin,
  campaignDashboard,
  campaignFacebookActor,
} from "../lib/campaign-dashboard";
import {
  classicPublisherPage,
  type ClassicPublishInput,
} from "../lib/classic-publisher";
import {
  executeCampaignTarget,
  executeClaimedCampaignTarget,
  campaignClaimCurrent,
} from "../lib/campaign-executor";
import {
  postingDiagnostics,
  postingMessages,
} from "../lib/posting-diagnostics";
import "../style.css";
type Connection = { tabId: number; origin: string; viewer: string };
export default function CampaignWorkspace() {
  const [validationAvailable, setValidationAvailable] = useState(false);
  const [validationReviewed, setValidationReviewed] = useState(false);
  const [receiptReviewed, setReceiptReviewed] = useState(false);
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
    setValidationReviewed(false);
    setReceiptReviewed(false);
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
    setValidationAvailable(false);
    clearApproval();
    try {
      const origin = campaignDashboardOrigin(url),
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
      activeFacebook.current = null;
      const identity = await readActor();
      const publisher = await campaignDashboard(
        tab.id,
        origin,
        session.viewer,
      ).read(`/api/campaigns/publisher?actor_id=${identity.actor_id}`);
      if (
        !publisher ||
        typeof publisher !== "object" ||
        !("viewer_id" in publisher) ||
        publisher.viewer_id !== session.viewer ||
        !("classic" in publisher) ||
        typeof publisher.classic !== "boolean"
      )
        throw new Error("Publisher response did not match your account.");
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
      const available =
        "validation_available" in publisher &&
        publisher.validation_available === true;
      setValidationAvailable(available);
      setNotice(
        publisher.classic
          ? "Connected. Review one exact campaign before starting."
          : !available
            ? "Connected. Live validation setup is pending for this workspace. You can save campaigns; publishing remains disabled."
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
    const targetUrl = new URL(group.url);
    const matches = (value: string | undefined) => {
      try {
        const url = new URL(value || "");
        return (
          url.origin === targetUrl.origin && url.pathname === targetUrl.pathname
        );
      } catch {
        return false;
      }
    };
    const existing = (
      await chrome.tabs.query({ url: "https://www.facebook.com/*" })
    ).find(
      (tab) =>
        tab.id !== undefined && tab.status === "complete" && matches(tab.url),
    );
    // Reuse only this exact group without navigating or replacing a user's draft.
    // A new target is initialized separately before navigation, avoiding a first-load/identity race.
    const tab =
      existing ??
      (await chrome.tabs.create({ url: "about:blank", active: true }));
    if (tab.id === undefined) throw new Error("Facebook tab unavailable.");
    activeFacebook.current = tab.id;
    await chrome.tabs.update(
      tab.id,
      existing ? { active: true } : { url: group.url, active: true },
    );
    const end = Date.now() + 20000;
    for (;;) {
      const current = await chrome.tabs.get(tab.id);
      if (current.status === "complete" && matches(current.url)) break;
      if (Date.now() > end || controller.current?.signal.aborted)
        throw new Error(
          "Facebook page did not become ready. Resolve any account check in Facebook.",
        );
      await new Promise((resolve) => setTimeout(resolve, 250));
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
    validationOnly = false,
  ) {
    if (
      !bridge ||
      !connection ||
      (!enabled && !validationOnly) ||
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
      latest.approved_digest !== current.approved_digest ||
      !campaignClaimCurrent(latest, target)
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
            expiresAt: Date.parse(target.lease_until || ""),
            media,
          },
        ],
      })
    )[0]?.result;
    if (!response)
      throw new Error("Facebook submission response was interrupted.");
    return response;
  }
  async function validateOne() {
    if (!bridge || !job || !actor || !validationReviewed || pending.current)
      return;
    const target = job.targets[0];
    if (!target) return;
    const group = groups.find((g) => g.id === target.group_id);
    if (!group) {
      setNotice("The first target group is unavailable. Refresh StaySuite.");
      return;
    }
    if (
      !window.confirm(
        `Publish ONE real validation post to ${group.title} as profile ${actor.actor_id}? This sends the exact displayed text and ${job.plan.media.length} attachment(s). Other groups will wait.`,
      )
    )
      return;
    pending.current = true;
    controller.current = new AbortController();
    setBusy(true);
    setRunning(true);
    clearApproval();
    try {
      const identity = await readActor();
      if (
        identity.actor_id !== actor.actor_id ||
        job.actor_id !== identity.actor_id
      )
        throw new Error("Facebook profile changed. Reconnect.");
      const claimed = await bridge.command({
        id: job.id,
        revision: job.revision,
        command: "validate_one",
        payload: {
          actor_id: identity.actor_id,
          adapter_version: "0.3.2",
          reviewed: true,
          digest: job.digest,
          target_id: target.id,
        },
      });
      setJob(claimed);
      if (!claimed.targets.some((t) => t.state === "claimed")) {
        setNotice(
          claimed.stop_reason || "Wait for the displayed eligibility time.",
        );
        return;
      }
      const result = await executeClaimedCampaignTarget(
        {
          command: bridge.command,
          actor: readActor,
          publish: (current, held) => publish(current, held, true),
        },
        claimed,
      );
      setJob(result);
      setNotice(
        result.stop_reason ||
          "The validation attempt finished. Check the exact result in Facebook before continuing.",
      );
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : "Validation was interrupted. Review the queue before retrying; nothing is automatically resubmitted.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
      setRunning(false);
    }
  }
  async function confirmValidation() {
    if (!bridge || !job || !actor || !receiptReviewed) return;
    const target = job.targets[0];
    if (!target?.post_url) return;
    setBusy(true);
    try {
      const identity = await readActor();
      if (
        identity.actor_id !== actor.actor_id ||
        job.actor_id !== identity.actor_id
      )
        throw new Error("Facebook identity changed. Reconnect.");
      const result = await bridge.command({
        id: job.id,
        revision: job.revision,
        command: "confirm_validation",
        payload: {
          actor_id: identity.actor_id,
          adapter_version: "0.3.2",
          reviewed: true,
          digest: job.digest,
          post_url: target.post_url,
        },
      });
      const status = await bridge.read(
        `/api/campaigns/publisher?actor_id=${identity.actor_id}`,
      );
      if (
        !status ||
        typeof status !== "object" ||
        !("viewer_id" in status) ||
        status.viewer_id !== connection?.viewer ||
        !("classic" in status) ||
        status.classic !== true
      )
        throw new Error(
          "Validation availability was not confirmed. Reconnect before starting.",
        );
      setEnabled(true);
      setJob(result);
      clearApproval();
      setNotice(
        "Validation recorded for this profile and adapter version. Review the remaining campaign and explicitly Start; nothing resumes automatically.",
      );
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "Could not confirm validation.",
      );
    } finally {
      setBusy(false);
    }
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
        const publishers = await bridge.read(
          `/api/campaigns/publisher?actor_id=${identity.actor_id}`,
        );
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
              <p>{c.id === job?.id ? job.state : c.state}</p>
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
          <p>
            Next eligible:{" "}
            {new Intl.DateTimeFormat("en-PH", {
              timeZone: "Asia/Manila",
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(job.next_eligible_at))}{" "}
            (Asia/Manila).{" "}
            {job.settings.avoidNight
              ? "Your 22:00–07:00 night pause is enabled."
              : "Your night pause is off."}
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
          {!enabled && (
            <section
              className="campaign-extension-validation"
              aria-label="Single live validation"
            >
              <h3>Validate with one real post</h3>
              {!validationAvailable && (
                <p role="status">
                  Live validation setup is pending. Publishing remains disabled
                  for this workspace.
                </p>
              )}
              <p>
                This publishes only the first group:{" "}
                <strong>
                  {groups.find((g) => g.id === job.targets[0]?.group_id)
                    ?.title || "Unavailable group"}
                </strong>
                . All other groups wait. Verify the exact text, attachments,
                profile and group rules before continuing.
              </p>
              <label className="consent">
                <input
                  type="checkbox"
                  checked={validationReviewed}
                  disabled={
                    busy ||
                    running ||
                    !validationAvailable ||
                    job.state !== "ready"
                  }
                  onChange={(e) => setValidationReviewed(e.target.checked)}
                />
                I authorize one real validation post to this first group with
                the exact displayed content.
              </label>
              <button
                disabled={
                  busy ||
                  running ||
                  !validationReviewed ||
                  !validationAvailable ||
                  job.state !== "ready" ||
                  !groups.some((g) => g.id === job.targets[0]?.group_id) ||
                  !job.actor_id ||
                  job.settings.method !== "classic" ||
                  job.plan.media.reduce((sum, m) => sum + m.size, 0) >
                    20 * 1024 * 1024
                }
                onClick={() => void validateOne()}
              >
                Publish one validation post
              </button>
              {job.targets[0]?.post_url &&
                ["live", "pending_admin"].includes(job.targets[0].state) && (
                  <div>
                    <p>
                      Reported result: {job.targets[0].state}.{" "}
                      <a
                        href={job.targets[0].post_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Inspect validation post in Facebook
                      </a>
                    </p>
                    <label className="consent">
                      <input
                        type="checkbox"
                        checked={receiptReviewed}
                        disabled={busy || running}
                        onChange={(e) => setReceiptReviewed(e.target.checked)}
                      />
                      I checked this post in Facebook: the text and attachments
                      match, the profile and group are correct, and I verified
                      its displayed result.
                    </label>
                    <button
                      disabled={busy || running || !receiptReviewed}
                      onClick={() => void confirmValidation()}
                    >
                      Confirm validation for this profile
                    </button>
                  </div>
                )}
              <p>
                A warning, restriction or uncertain result stops the attempt. It
                is never automatically retried. Profile validation expires after
                seven days, an adapter-version change, a failed result or
                deletion of the validation receipt.
              </p>
            </section>
          )}
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
              Bulk publishing is locked until the single-post validation
              succeeds and you confirm its result. A composer check alone does
              not unlock posting.
            </p>
          )}
          {job.targets
            .filter((t) => t.provider_code)
            .map((t) => (
              <p key={t.id} role="status">
                Group {t.position + 1}:{" "}
                {postingMessages[t.provider_code!] || t.provider_code}
              </p>
            ))}
          <button
            className="secondary"
            onClick={() => {
              const file = URL.createObjectURL(
                new Blob([JSON.stringify(postingDiagnostics(job), null, 2)], {
                  type: "application/json",
                }),
              );
              const link = document.createElement("a");
              link.href = file;
              link.download = "staysuite-posting-diagnostics.json";
              link.click();
              setTimeout(() => URL.revokeObjectURL(file), 1000);
            }}
          >
            Download posting diagnostics
          </button>
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
