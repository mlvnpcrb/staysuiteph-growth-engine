import {
  COMPOSE_ENGINE_RUN,
  composeEngineRunSchema,
  groupResponseSchema,
  type CampaignJob,
  type ComposeEngineConnection,
  type ComposeEngineOpen,
  type ComposeEngineRun,
} from "@staysuite/validation";
import { campaignDashboard } from "./campaign-dashboard";
import { assertComposeEnginePost } from "./compose-engine-domain";
import {
  campaignClaimCurrent,
  executeCampaignTarget,
} from "./campaign-executor";
import { directPublisherPage } from "./direct-publisher";
import type { ClassicPublishInput } from "./classic-publisher";

export const COMPOSE_RUN_ALARM = "staysuite-compose-run:";
type Context = {
  bridge: ReturnType<typeof campaignDashboard>;
  actor: { actor_id: string; actor_type: "personal" };
  actorTabId: number | null;
};
type Verify = (connection: ComposeEngineConnection) => Promise<Context>;
const busy = new Set<string>();
const key = (id: string) => COMPOSE_ENGINE_RUN + id;
const alarm = (id: string) => COMPOSE_RUN_ALARM + id;
async function store(run: ComposeEngineRun) {
  await chrome.storage.session.set({ [key(run.input.request_id)]: run });
}
function exactRun(job: CampaignJob, run: ComposeEngineRun) {
  if (
    job.id !== run.input.campaign_id ||
    job.user_id !== run.input.viewer_id ||
    job.digest !== run.input.digest ||
    job.approved_digest !== run.input.digest ||
    job.actor_id !== run.input.actor_id ||
    job.actor_type !== "personal" ||
    job.settings.method !== "direct"
  )
    throw new Error(
      "The approved post or account changed. Review before restarting.",
    );
}
async function ready(context: Context, connection: ComposeEngineConnection) {
  const value: unknown = await context.bridge.read(
    `/api/campaigns/publisher?actor_id=${context.actor.actor_id}&method=direct`,
  );
  if (
    !value ||
    typeof value !== "object" ||
    !("viewer_id" in value) ||
    value.viewer_id !== connection.viewer ||
    !("direct" in value) ||
    value.direct !== true
  )
    throw new Error(
      "This profile needs Direct publisher validation in the extension workspace before posting.",
    );
}

/** The owner Post click approves one immutable queue; no visible engine tab. */
export async function startComposeRun(
  input: ComposeEngineOpen,
  connection: ComposeEngineConnection,
  verify: Verify,
) {
  const records = await chrome.storage.session.get(null);
  const prior = composeEngineRunSchema.safeParse(
    records[key(input.request_id)],
  );
  if (prior.success) {
    if (
      JSON.stringify(prior.data.input) !== JSON.stringify(input) ||
      prior.data.connection.generation !== connection.generation
    )
      throw new Error(
        "Posting request changed. Review the saved execution history.",
      );
    if (prior.data.state === "stopped")
      throw new Error(
        prior.data.error || "The posting run stopped. Review its results.",
      );
    return;
  }
  if (
    Object.entries(records).some(([name, value]) => {
      const parsed = composeEngineRunSchema.safeParse(value);
      return (
        name.startsWith(COMPOSE_ENGINE_RUN) &&
        parsed.success &&
        ["starting", "running"].includes(parsed.data.state)
      );
    })
  )
    throw new Error(
      "A posting run is already active. Finish or pause it before starting another.",
    );
  const context = await verify(connection);
  await ready(context, connection);
  let job = await context.bridge.command({
    id: input.campaign_id,
    revision: 0,
    command: "inspect",
    payload: {},
  });
  assertComposeEnginePost(input, job, context.actor, connection.viewer);
  const run: ComposeEngineRun = {
    input,
    connection,
    state: "starting",
    created_at: Date.now(),
    error: null,
  };
  // Persist and arm before mutating the server. An interrupted start never repeats approval.
  await store(run);
  busy.add(input.request_id);
  try {
    await chrome.alarms.create(alarm(input.request_id), {
      delayInMinutes: 1,
      periodInMinutes: 1,
    });
    job = await context.bridge.command({
      id: job.id,
      revision: job.revision,
      command: "approve",
      payload: { digest: input.digest },
    });
    if (job.state !== "ready")
      throw new Error("Post approval was not confirmed.");
    exactRun(job, run);
    const fresh = await verify(connection);
    await ready(fresh, connection);
    job = await fresh.bridge.command({
      id: job.id,
      revision: job.revision,
      command: "start",
      payload: fresh.actor,
    });
    exactRun(job, run);
    if (job.state !== "running")
      throw new Error("The posting queue did not start.");
    await store({ ...run, state: "running" });
    await chrome.alarms.create(alarm(input.request_id), {
      when: Date.now() + 100,
      periodInMinutes: 1,
    });
  } catch (error) {
    await store({
      ...run,
      state: "stopped",
      error:
        error instanceof Error
          ? error.message.slice(0, 500)
          : "Posting start interrupted. Review saved results.",
    });
    await chrome.alarms.clear(alarm(input.request_id));
    throw error;
  } finally {
    busy.delete(input.request_id);
  }
}

async function publish(
  run: ComposeEngineRun,
  verify: Verify,
  job: CampaignJob,
  target: CampaignJob["targets"][number],
) {
  let context = await verify(run.connection);
  await ready(context, run.connection);
  const loaded = await context.bridge.restore(job.id);
  if (
    loaded.viewer_id !== run.connection.viewer ||
    loaded.job.digest !== job.digest
  )
    throw new Error("Saved content changed before dispatch.");
  if (
    job.plan.media.reduce((sum, media) => sum + media.size, 0) >
    20 * 1024 * 1024
  )
    throw new Error("Direct photo posting supports at most 20 MB per post.");
  const media: ClassicPublishInput["media"] = [];
  for (const saved of [...loaded.job.media].sort(
    (a, b) => a.position - b.position,
  )) {
    const asset = loaded.assets.find((item) => item.id === saved.id);
    if (!asset || !saved.uploaded)
      throw new Error("Missing private attachment.");
    const url = new URL(asset.url);
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      )
    )
      throw new Error("Invalid private media URL.");
    const response = await fetch(url, {
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error("Private media could not be read.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length !== saved.manifest.size)
      throw new Error("Attachment size changed.");
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 16384)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
    media.push({ ...saved.manifest, base64: btoa(binary) });
  }
  if (media.length !== job.plan.media.length)
    throw new Error("Attachment manifest incomplete.");
  context = await verify(run.connection);
  await ready(context, run.connection);
  const groups = groupResponseSchema.parse(
    await context.bridge.read("/api/groups"),
  );
  const group = groups.groups?.find((item) => item.id === target.group_id);
  if (
    groups.viewer_id !== run.connection.viewer ||
    !group ||
    !/^https:\/\/www\.facebook\.com\/groups\/[1-9]\d*\/$/.test(group.url)
  )
    throw new Error("The selected group or account is unavailable.");
  const latest = await context.bridge.command({
    id: job.id,
    revision: 0,
    command: "inspect",
    payload: {},
  });
  exactRun(latest, run);
  if (
    latest.state !== "running" ||
    !campaignClaimCurrent(latest, target) ||
    context.actorTabId === null
  )
    throw new Error("The posting claim is no longer current.");
  const response = (
    await chrome.scripting.executeScript({
      target: { tabId: context.actorTabId },
      world: "MAIN",
      func: directPublisherPage,
      args: [
        {
          actorId: job.actor_id!,
          groupUrl: group.url,
          text: job.plan.text,
          attemptToken: target.attempt_token!,
          approvalDigest: job.digest,
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

/** One operation per wakeup. Server eligibility/claims survive service-worker suspension. */
export async function tickComposeRun(id: string, verify: Verify) {
  if (busy.has(id)) return;
  busy.add(id);
  let run: ComposeEngineRun | null = null;
  let context: Context | null = null;
  try {
    const saved = composeEngineRunSchema.safeParse(
      (await chrome.storage.session.get(key(id)))[key(id)],
    );
    if (
      !saved.success ||
      saved.data.state === "done" ||
      saved.data.state === "stopped"
    ) {
      await chrome.alarms.clear(alarm(id));
      return;
    }
    run = saved.data;
    context = await verify(run.connection);
    if (run.state !== "running")
      throw new Error(
        "Posting start was interrupted. Review the saved queue before restarting.",
      );
    let job = await context.bridge.command({
      id: run.input.campaign_id,
      revision: 0,
      command: "inspect",
      payload: {},
    });
    exactRun(job, run);
    if (job.state !== "running") {
      await store({
        ...run,
        state: job.state === "completed" ? "done" : "stopped",
        error: job.stop_reason,
      });
      await chrome.alarms.clear(alarm(id));
      return;
    }
    // A worker interrupted after claim may already have sent the mutation. Never redispatch it.
    if (job.targets.some((target) => target.state === "claimed"))
      throw new Error(
        "A prior submission was interrupted. Review its outcome before continuing.",
      );
    if (Date.parse(job.next_eligible_at) > Date.now()) {
      await chrome.alarms.create(alarm(id), {
        when: Date.parse(job.next_eligible_at),
        periodInMinutes: 1,
      });
      return;
    }
    await ready(context, run.connection);
    const pinned = run;
    job = await executeCampaignTarget(
      {
        command: context.bridge.command,
        actor: async () => (await verify(pinned.connection)).actor,
        publish: (current, target) => publish(pinned, verify, current, target),
      },
      job.id,
    );
    if (job.state === "running") {
      await chrome.alarms.create(alarm(id), {
        when: Math.max(Date.now() + 1000, Date.parse(job.next_eligible_at)),
        periodInMinutes: 1,
      });
    } else {
      await store({
        ...run,
        state: job.state === "completed" ? "done" : "stopped",
        error: job.stop_reason,
      });
      await chrome.alarms.clear(alarm(id));
    }
  } catch (error) {
    if (run) {
      const message =
        error instanceof Error
          ? error.message.slice(0, 500)
          : "Posting was interrupted. Review the saved results.";
      await store({ ...run, state: "stopped", error: message });
      // Pause only through the still-authenticated pinned workspace; never substitute an account.
      if (context) {
        try {
          const job = await context.bridge.command({
            id: run.input.campaign_id,
            revision: 0,
            command: "inspect",
            payload: {},
          });
          if (job.state === "running")
            await context.bridge.command({
              id: job.id,
              revision: job.revision,
              command: "pause",
              payload: {},
            });
        } catch {
          /* The persisted stopped record prevents another dispatch. */
        }
      }
    }
    await chrome.alarms.clear(alarm(id));
  } finally {
    busy.delete(id);
  }
}
