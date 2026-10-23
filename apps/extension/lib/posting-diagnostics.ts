import type { CampaignJob } from "@staysuite/validation";
export function postingDiagnostics(job: CampaignJob | null) {
  return {
    schema: 1,
    adapterVersion: "0.3.2",
    generatedAt: new Date().toISOString(),
    campaignState: job?.state ?? "not_selected",
    targets:
      job?.targets.map((t) => ({
        position: t.position,
        state: t.state,
        code: t.provider_code ?? null,
      })) ?? [],
  };
}
export const postingMessages: Record<string, string> = {
  obstructed_composer:
    "Another Facebook dialog covers the Post control. Resolve it manually; nothing was submitted.",
  composer_unavailable:
    "Facebook's post composer could not be identified. Open the selected group and check that posting is available.",
  composer_shape_unknown:
    "Facebook's composer structure changed. Nothing was submitted.",
  actor_unavailable:
    "The current Facebook profile could not be verified. Open Facebook and reconnect.",
  actor_changed:
    "The Facebook identity changed. Reconnect using the selected personal profile.",
  facebook_warning:
    "Facebook displayed an account or posting warning. Resolve it in Facebook; do not retry automatically.",
  existing_draft:
    "An existing Facebook draft was preserved. Review it before starting a new attempt.",
  media_input_unavailable:
    "Facebook's attachment picker could not be identified. Nothing was submitted.",
  media_previews_unconfirmed:
    "Facebook did not confirm all attachment previews. Check the draft manually.",
  media_digest_changed:
    "The downloaded attachment did not match its saved hash. Nothing was submitted.",
  dispatch_media_limit: "The post exceeds the Classic adapter's 20 MB limit.",
  text_insert_failed:
    "Facebook did not accept the post text. Nothing was submitted.",
  text_changed:
    "The composer text did not match the approved post. Submission stopped.",
  submit_unavailable:
    "Facebook's Post control was unavailable. Check posting permissions or group restrictions.",
  claim_expired:
    "The submission lease expired. Inspect Facebook and resolve the queue before another attempt.",
  publication_unconfirmed:
    "The result could not be confirmed. Check Facebook before resolving this attempt; never retry it automatically.",
  post_url_without_confirmation:
    "A post link was found without a submission confirmation. Inspect the post before resolving the outcome.",
  pending_without_post_url:
    "Facebook indicated moderation but supplied no matching post link. Check the group's pending posts manually.",
  interrupted:
    "The connection was interrupted. The post might have been sent; inspect Facebook before any new attempt.",
};
