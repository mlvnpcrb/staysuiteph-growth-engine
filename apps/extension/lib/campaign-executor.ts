import type { CampaignJob, CampaignCommand } from "@staysuite/validation";
import type { ClassicPublishResult } from "./classic-publisher";
export type ExecutorPort = {
  command: (input: CampaignCommand) => Promise<CampaignJob>;
  actor: () => Promise<{ actor_id: string; actor_type: "personal" | "page" }>;
  publish: (
    job: CampaignJob,
    target: CampaignJob["targets"][number],
  ) => Promise<ClassicPublishResult>;
};
/** An expired/recovered/replaced claim must never dispatch after asynchronous work. */
export function campaignClaimCurrent(
  job: CampaignJob,
  target: CampaignJob["targets"][number],
  now = Date.now(),
) {
  const current = job.targets.find((t) => t.id === target.id);
  return (
    !!current &&
    current.state === "claimed" &&
    !!target.attempt_token &&
    current.attempt_token === target.attempt_token &&
    current.lease_until !== null &&
    Date.parse(current.lease_until) > now
  );
}
/** One server-claimed operation, never an automatic retry of an ambiguous publish. */
export async function executeCampaignTarget(port: ExecutorPort, id: string) {
  let job = await port.command({
    id,
    revision: 0,
    command: "inspect",
    payload: {},
  });
  const actor = await port.actor();
  if (job.actor_id !== actor.actor_id || job.actor_type !== actor.actor_type)
    throw new Error("Facebook identity changed. Nothing was sent.");
  if (job.state !== "running") return job;
  if (job.settings.method !== "classic")
    throw new Error("This publishing method has no validated adapter.");
  job = await port.command({
    id,
    revision: job.revision,
    command: "claim",
    payload: actor,
  });
  return executeClaimedCampaignTarget(port, job, actor);
}
export async function executeClaimedCampaignTarget(
  port: ExecutorPort,
  job: CampaignJob,
  expectedActor?: { actor_id: string; actor_type: "personal" | "page" },
) {
  const id = job.id;
  if (job.state !== "running" || job.settings.method !== "classic")
    throw new Error("No running Classic submission claim.");
  const actor = expectedActor ?? (await port.actor());
  if (job.actor_id !== actor.actor_id || job.actor_type !== actor.actor_type)
    throw new Error("Facebook identity changed. Nothing was sent.");
  const target = job.targets.find((t) => t.state === "claimed");
  if (!target) return job;
  if (!target.attempt_token) throw new Error("Submission claim missing.");
  // An interrupted response before this point cannot dispatch. After this point,
  // any exception is uncertain: never call publish again with this token.
  const latest = await port.command({
    id,
    revision: 0,
    command: "inspect",
    payload: {},
  });
  if (
    latest.state !== "running" ||
    latest.approved_digest !== job.approved_digest ||
    latest.digest !== job.digest ||
    !campaignClaimCurrent(latest, target)
  )
    return port.command({
      id,
      revision: 0,
      command: "report",
      payload: { attempt_token: target.attempt_token, outcome: "stopped" },
    });
  const again = await port.actor();
  if (
    again.actor_id !== actor.actor_id ||
    again.actor_type !== actor.actor_type
  )
    return port.command({
      id,
      revision: 0,
      command: "report",
      payload: { attempt_token: target.attempt_token, outcome: "stopped" },
    });
  let receipt: ClassicPublishResult;
  try {
    receipt = await port.publish(job, target);
  } catch {
    receipt = { outcome: "uncertain", code: "interrupted" };
  }
  const outcome =
    receipt.outcome === "ready" || receipt.outcome === "not_sent"
      ? "stopped"
      : receipt.outcome;
  return port.command({
    id,
    revision: 0,
    command: "report",
    payload: {
      attempt_token: target.attempt_token,
      outcome,
      ...(/^[a-z_]{1,64}$/.test(receipt.code)
        ? { provider_code: receipt.code }
        : {}),
      ...(receipt.postUrl ? { post_url: receipt.postUrl } : {}),
    },
  });
}
