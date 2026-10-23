import { z } from "zod";
export const publicEnvironmentSchema = z.object({
  url: z
    .url()
    .refine(
      (value) =>
        value.startsWith("https://") ||
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(value),
      "Use HTTPS outside local development",
    ),
  key: z.string().min(1),
});
export const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
});
export const profileSchema = z.object({
  display_name: z.string().trim().min(1).max(80),
});
export const syncSnapshotSchema = z.object({
  userId: z.uuid(),
  serverTime: z.iso.datetime(),
  integration: z.literal("not_connected"),
});
export function bearerToken(header: string | null): string | null {
  const match = /^Bearer ([^\s]+)$/.exec(header ?? "");
  return match?.[1] ?? null;
}
export function safeDashboardUrl(value: string): string {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      ))
  )
    throw new Error("Dashboard must use HTTPS or local HTTP");
  return url.origin;
}
export * from "./groups";
export * from "./group-assessment";
export * from "./group-collection";
export * from "./group-marketing";
export * from "./facebook-library";

export * from "./group-categories";
export { assessPostingPriority } from "./posting-priority";
export { campaignPlanSchema, campaignMediaSchema, campaignApprovalSnapshot, campaignGroupBlockers, detectCampaignMediaType, type CampaignPlan } from "./campaign-plan";
export {campaignSettingsSchema,campaignCommandSchema,campaignJobSchema,type CampaignJob,type CampaignSettings,type CampaignCommand} from "./campaign-execution";

export {campaignCommandReplySchema,campaignListSchema,type CampaignList} from "./campaign-execution";
