import {
  composeEngineOpenSchema,
  type CampaignJob,
  type ComposeEngineOpen,
} from "@staysuite/validation";
/** Both the exact saved version and fresh actor must agree with the owner's review. */
export function assertComposeEnginePost(
  input: ComposeEngineOpen,
  job: CampaignJob,
  actor: { actor_id: string; actor_type: string },
  viewer: string,
) {
  composeEngineOpenSchema.parse(input);
  if (input.viewer_id !== viewer || job.user_id !== viewer)
    throw new Error("StaySuite account changed. Reconnect the posting engine.");
  if (
    job.id !== input.campaign_id ||
    job.revision !== input.revision ||
    job.digest !== input.digest
  )
    throw new Error(
      "The saved post changed. Review the current Compose draft again.",
    );
  if (
    actor.actor_id !== input.actor_id ||
    actor.actor_type !== input.actor_type ||
    job.actor_id !== input.actor_id ||
    job.actor_type !== input.actor_type
  )
    throw new Error(
      "Facebook identity changed. Review the posting identity again.",
    );
  if (job.settings.method !== "direct")
    throw new Error("Choose Direct posting for this engine request.");
  if (!["draft", "ready"].includes(job.state))
    throw new Error(
      "This post already has execution history. Review it in the posting engine.",
    );
  if (job.plan.media.some((media) => media.type.startsWith("video/")))
    throw new Error("Direct video posting has not been verified yet.");
  if (
    job.targets.length !== job.plan.groupIds.length ||
    job.targets.some(
      (target, index) =>
        target.position !== index ||
        target.group_id !== job.plan.groupIds[index] ||
        target.state !== "queued",
    )
  )
    throw new Error(
      "The target queue changed. Review the saved post before starting.",
    );
  if (
    job.media.length !== job.plan.media.length ||
    job.media.some((media) => !media.uploaded)
  )
    throw new Error("Finish uploading every attachment before posting.");
}
