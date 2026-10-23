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
    latest.digest !== job.digest
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
      ...(receipt.postUrl ? { post_url: receipt.postUrl } : {}),
    },
  });
}
