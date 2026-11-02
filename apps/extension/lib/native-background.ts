import {
  nativeApplicationRequestSchema,
  COMPOSE_ENGINE_CONNECTION,
  COMPOSE_ENGINE_RUN,
  composeEngineRunSchema,
  campaignCommandReplySchema,
  automationSnapshotSchema,
  type ComposeEngineRun,
} from "@staysuite/validation";
import {
  nativeRequest,
  nativeSignIn,
  nativeSignOut,
  nativeUser,
  nativeCampaignBridge,
} from "./native-backend";
import {
  nativeCampaignContext,
  nativeEngineStatus,
  nativeFacebook,
} from "./native-context";
import {
  startComposeRun,
  tickComposeRun,
  publishComposeTarget,
  COMPOSE_RUN_ALARM,
} from "./compose-engine-runner";
import { assertComposeEnginePost } from "./compose-engine-domain";
import { executeClaimedCampaignTarget } from "./campaign-executor";
import { loadFacebookLibrary } from "./facebook-store";

let operations: Promise<unknown> = Promise.resolve();
const scheduleAlarm = "staysuite-native-schedules-v1";
let scheduling = false;
async function nativeSchedulesTick() {
  if (scheduling) return;
  scheduling = true;
  try {
    const user = await nativeUser();
    const bridge = nativeCampaignBridge(user.id);
    const records = await chrome.storage.session.get(null);
    // Also reconcile UI pauses while the next eligibility time is far away.
    for (const [name, value] of Object.entries(records)) {
      const run = composeEngineRunSchema.safeParse(value);
      if (
        name.startsWith(COMPOSE_ENGINE_RUN) &&
        run.success &&
        run.data.connection.mode === "native" &&
        run.data.connection.viewer === user.id &&
        run.data.state === "running"
      )
        await tickComposeRun(run.data.input.request_id, nativeCampaignContext);
    }
    const latestRecords = await chrome.storage.session.get(null);
    if (
      Object.entries(latestRecords).some(([name, value]) => {
        const run = composeEngineRunSchema.safeParse(value);
        return (
          name.startsWith(COMPOSE_ENGINE_RUN) &&
          run.success &&
          ["starting", "running"].includes(run.data.state)
        );
      })
    )
      return;
    const definitions = await bridge.schedules();
    if (!definitions.schedules.some((item) => item.state === "enabled")) {
      const flows = automationSnapshotSchema.parse(
        await bridge.read("/api/automation-flows"),
      );
      if (
        flows.viewer_id !== user.id ||
        !flows.flows.some((item) => item.state === "enabled")
      )
        return;
    }
    const engine = await nativeEngineStatus();
    if (!engine.status.publisher_ready) return;
    const { actor } = await nativeCampaignContext(engine.connection);
    const ids = await bridge.scheduleTick(actor);
    for (const id of ids) {
      const job = await bridge.command({
        id,
        revision: 0,
        command: "inspect",
        payload: {},
      });
      if (
        job.state !== "running" ||
        job.settings.method !== "direct" ||
        job.actor_id !== actor.actor_id ||
        job.actor_type !== "personal" ||
        job.approved_digest !== job.digest
      )
        continue;
      const request_id = crypto.randomUUID();
      const run: ComposeEngineRun = {
        input: {
          request_id,
          campaign_id: job.id,
          revision: job.revision,
          digest: job.digest,
          actor_id: actor.actor_id,
          actor_type: "personal",
          viewer_id: user.id,
          reviewed: true,
        },
        connection: engine.connection,
        state: "running",
        created_at: Date.now(),
        error: null,
      };
      await chrome.storage.session.set({
        [COMPOSE_ENGINE_RUN + request_id]: run,
      });
      await chrome.alarms.create(COMPOSE_RUN_ALARM + request_id, {
        delayInMinutes: 1,
        periodInMinutes: 1,
      });
      void tickComposeRun(request_id, nativeCampaignContext).catch(() => {});
      break;
    }
  } catch {
    /* No actor/session/readiness means no scheduled dispatch. */
  } finally {
    scheduling = false;
  }
}
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === scheduleAlarm) void nativeSchedulesTick();
});
chrome.runtime.onStartup.addListener(() => {
  void nativeUser()
    .then(() => chrome.alarms.create(scheduleAlarm, { periodInMinutes: 1 }))
    .catch(() => {});
});
async function stopRuns() {
  const user = await nativeUser();
  const bridge = nativeCampaignBridge(user.id);
  const records = await chrome.storage.session.get(null);
  for (const [name, value] of Object.entries(records)) {
    const parsed = composeEngineRunSchema.safeParse(value);
    if (
      !name.startsWith(COMPOSE_ENGINE_RUN) ||
      !parsed.success ||
      parsed.data.connection.mode !== "native"
    )
      continue;
    const run = parsed.data;
    if (
      run.connection.viewer === user.id &&
      ["starting", "running"].includes(run.state)
    ) {
      const job = await bridge.command({
        id: run.input.campaign_id,
        revision: 0,
        command: "inspect",
        payload: {},
      });
      if (job.state === "running")
        await bridge.command({
          id: job.id,
          revision: job.revision,
          command: "pause",
          payload: {},
        });
    }
    await chrome.storage.session.set({
      [name]: {
        ...run,
        state: "stopped",
        error: "Signed out. Review saved results before restarting.",
      },
    });
    await chrome.alarms.clear(COMPOSE_RUN_ALARM + run.input.request_id);
  }
  await chrome.storage.session.remove(COMPOSE_ENGINE_CONNECTION);
}
export async function handleNativeRequest(raw: unknown) {
  const request = nativeApplicationRequestSchema.parse(raw);
  if (request.type === "NATIVE_USER") {
    try {
      return { user: await nativeUser() };
    } catch {
      return { user: null };
    }
  }
  if (request.type === "NATIVE_SIGN_IN") {
    const user = await nativeSignIn(request.email, request.password);
    await chrome.alarms.create(scheduleAlarm, { periodInMinutes: 1 });
    return { user };
  }
  if (request.type === "NATIVE_SIGN_OUT") {
    await stopRuns();
    await chrome.alarms.clear(scheduleAlarm);
    await nativeSignOut();
    return {};
  }
  if (request.type === "NATIVE_API") {
    const response = await nativeRequest(
      request.path,
      request.method,
      request.body,
      request.viewer,
    );
    if (
      request.path === "/api/campaigns" &&
      request.method === "POST" &&
      response.status === 200
    ) {
      const reply = campaignCommandReplySchema.safeParse(
        JSON.parse(response.body),
      );
      if (
        reply.success &&
        ["paused", "cancelled"].includes(reply.data.job.state)
      ) {
        const records = await chrome.storage.session.get(null);
        for (const [name, value] of Object.entries(records)) {
          const run = composeEngineRunSchema.safeParse(value);
          if (
            name.startsWith(COMPOSE_ENGINE_RUN) &&
            run.success &&
            run.data.connection.mode === "native" &&
            run.data.connection.viewer === request.viewer &&
            run.data.input.campaign_id === reply.data.job.id
          ) {
            await chrome.storage.session.set({
              [name]: {
                ...run.data,
                state: "stopped",
                error:
                  "The queue was paused or cancelled. Review results before continuing.",
              },
            });
            await chrome.alarms.clear(
              COMPOSE_RUN_ALARM + run.data.input.request_id,
            );
          }
        }
      }
    }
    return response;
  }
  if (request.type === "NATIVE_SYNC_GROUPS") {
    const user = await nativeUser();
    if (user.id !== request.viewer)
      throw new Error("StaySuite account changed.");
    const { actor } = await nativeFacebook();
    const library = await loadFacebookLibrary(actor.actor_id);
    if (!library || library.phase === "fetching")
      throw new Error("Finish importing Facebook groups first.");
    let saved = 0;
    for (const group of library.groups.slice(0, 500)) {
      const fresh = await nativeFacebook();
      if (fresh.actor.actor_id !== actor.actor_id)
        throw new Error("Facebook identity changed. Import stopped.");
      const response = await nativeRequest(
        "/api/groups",
        "POST",
        JSON.stringify({
          title: group.title,
          url: group.url,
          destination: "",
          accommodation: "",
          audience: "",
          evidence: "Imported from your signed-in Facebook group library.",
        }),
        user.id,
      );
      if (response.status >= 400)
        throw new Error(
          `Group import stopped after ${saved} groups. Review the group library before retrying.`,
        );
      saved++;
    }
    return { saved, actor_id: actor.actor_id };
  }
  const engine = await nativeEngineStatus();
  if (request.type === "NATIVE_ENGINE_STATUS") return { status: engine.status };
  const context = await nativeCampaignContext(engine.connection);
  if (request.type === "NATIVE_CONFIRM_VALIDATION") {
    if (request.actor_id !== context.actor.actor_id)
      throw new Error("Facebook identity changed.");
    const job = await context.bridge.command({
      id: request.id,
      revision: request.revision,
      command: "confirm_validation",
      payload: {
        actor_id: request.actor_id,
        adapter_version: "0.4.0",
        reviewed: request.reviewed,
        digest: request.digest,
        post_url: request.post_url,
      },
    });
    return { job };
  }
  let job = await context.bridge.command({
    id: request.input.campaign_id,
    revision: 0,
    command: "inspect",
    payload: {},
  });
  assertComposeEnginePost(
    request.input,
    job,
    context.actor,
    engine.connection.viewer,
  );
  if (request.type === "NATIVE_VALIDATE_ONE") {
    // The explicit first-post checkbox/button authorizes this exact version.
    // The server requires approval before issuing its single validation claim.
    if (job.state === "draft") {
      job = await context.bridge.command({
        id: job.id,
        revision: job.revision,
        command: "approve",
        payload: { digest: request.input.digest },
      });
    }
    if (job.state !== "ready" || job.approved_digest !== request.input.digest)
      throw new Error("The exact validation post approval was not confirmed.");
    await nativeCampaignContext(engine.connection);
    const target = job.targets[0];
    if (!target)
      throw new Error("Choose a group before checking the publisher.");
    const claimed = await context.bridge.command({
      id: job.id,
      revision: job.revision,
      command: "validate_one",
      payload: {
        actor_id: context.actor.actor_id,
        adapter_version: "0.4.0",
        reviewed: true,
        digest: job.digest,
        target_id: target.id,
      },
    });
    if (!claimed.targets.some((item) => item.state === "claimed"))
      return { job: claimed };
    const run: ComposeEngineRun = {
      input: request.input,
      connection: engine.connection,
      state: "running",
      error: null,
      created_at: Date.now(),
    };
    const result = await executeClaimedCampaignTarget(
      {
        command: context.bridge.command,
        actor: async () =>
          (await nativeCampaignContext(engine.connection)).actor,
        publish: (current, held) =>
          publishComposeTarget(run, nativeCampaignContext, current, held, true),
      },
      claimed,
    );
    return { job: result };
  }
  if (!engine.status.publisher_ready)
    return {
      request_id: request.input.request_id,
      validation_required: true,
      input: request.input,
      job,
    };
  await startComposeRun(
    request.input,
    engine.connection,
    nativeCampaignContext,
  );
  void tickComposeRun(request.input.request_id, nativeCampaignContext).catch(
    () => {},
  );
  return { request_id: request.input.request_id };
}
export function isNativeSender(sender: chrome.runtime.MessageSender) {
  return (
    sender.id === chrome.runtime.id &&
    (sender.frameId === undefined || sender.frameId === 0) &&
    [
      chrome.runtime.getURL("popup.html"),
      chrome.runtime.getURL("tabs/suite.html"),
    ].includes(sender.url?.split(/[?#]/)[0] ?? "")
  );
}
chrome.runtime.onMessage.addListener((message: unknown, sender, reply) => {
  if (
    !message ||
    typeof message !== "object" ||
    !("type" in message) ||
    !String(message.type).startsWith("NATIVE_")
  )
    return false;
  if (!isNativeSender(sender)) {
    reply({ ok: false, error: "This extension sender was not accepted." });
    return false;
  }
  const task = operations.then(() => handleNativeRequest(message));
  operations = task.catch(() => {});
  void task
    .then((result) => reply({ ok: true, ...result }))
    .catch((error) =>
      reply({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "StaySuite operation failed.",
      }),
    );
  return true;
});
