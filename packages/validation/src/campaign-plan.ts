import { z } from "zod";
import type { SavedGroup } from "@staysuite/types";
import { rankGroupMarketing } from "./group-marketing";
export const campaignMediaSchema = z
  .object({
    name: z.string().min(1).max(255),
    type: z.enum([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/webm",
      "video/quicktime",
    ]),
    size: z
      .number()
      .int()
      .positive()
      .max(50 * 1024 * 1024),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const campaignPlanSchema = z
  .object({
    version: z.literal(1),
    text: z.string().trim().min(1).max(10000),
    intervalMinutes: z.number().int().min(1).max(1440),
    groupIds: z.array(z.uuid()).min(1).max(50),
    media: z.array(campaignMediaSchema).max(10),
  })
  .strict()
  .superRefine((plan, ctx) => {
    if (new Set(plan.groupIds).size !== plan.groupIds.length)
      ctx.addIssue({ code: "custom", message: "Select each group only once." });
    if (plan.media.reduce((sum, item) => sum + item.size, 0) > 50 * 1024 * 1024)
      ctx.addIssue({
        code: "custom",
        message: "The workspace limit is 50 MB per campaign.",
      });
    if (
      plan.media.some((m) => m.type.startsWith("video/")) &&
      plan.media.length !== 1
    )
      ctx.addIssue({
        code: "custom",
        message: "Choose photos or one video, not a mixture.",
      });
    if (new Set(plan.media.map((m) => m.sha256)).size !== plan.media.length)
      ctx.addIssue({
        code: "custom",
        message: "Remove duplicate media files.",
      });
  });
export type CampaignPlan = z.infer<typeof campaignPlanSchema>;
/** Fingerprint includes exact text, target order, media contents and rule versions. Not server authorization. */
export function campaignApprovalSnapshot(
  plan: CampaignPlan,
  groups: readonly SavedGroup[],
) {
  const parsed = campaignPlanSchema.parse(plan);
  const targets = parsed.groupIds.map((id) => {
    const group = groups.find((g) => g.id === id);
    if (!group) throw new Error("A selected group is no longer available.");
    return {
      id,
      userId: group.user_id,
      identity: group.identity,
      url: group.url,
      updatedAt: group.updated_at,
      reviewStatus: group.review_status,
      ruleEvidence: group.rule_evidence,
      reviewedAt: group.last_reviewed_at,
      marketingEvidence: group.marketing_evidence ?? {},
    };
  });
  return JSON.stringify({ ...parsed, text: plan.text, targets });
}
export function campaignGroupBlockers(group: SavedGroup, now = Date.now()) {
  const report = rankGroupMarketing(group, now);
  if (report.readiness === "blocked")
    return ["Not suitable or promotion prohibited"];
  return report.readiness === "reviewed_permission"
    ? []
    : ["Fresh rule and promotion-permission review needed"];
}
/** File signatures, not a filename or browser-supplied MIME claim. */
export function detectCampaignMediaType(bytes: Uint8Array) {
  const ascii = (start: number, count: number) =>
    String.fromCharCode(...bytes.slice(start, start + count));
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg" as const;
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v))
    return "image/png" as const;
  if (["GIF87a", "GIF89a"].includes(ascii(0, 6))) return "image/gif" as const;
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP")
    return "image/webp" as const;
  if (ascii(4, 4) === "ftyp") {
    const brand = ascii(8, 4);
    if (brand === "qt  ") return "video/quicktime" as const;
    if (["isom", "iso2", "mp41", "mp42", "avc1", "M4V "].includes(brand))
      return "video/mp4" as const;
  }
  if (
    [26, 69, 223, 163].every((v, i) => bytes[i] === v) &&
    ascii(0, 256).includes("webm")
  )
    return "video/webm" as const;
  return null;
}
