import { z } from "zod";
import { campaignMediaSchema, campaignPlanSchema } from "./campaign-plan";
export const campaignSettingsSchema = z
  .object({
    method: z.enum(["classic", "direct"]).default("classic"),
    pauseEvery: z.number().int().min(1).max(50).default(1),
    pauseMinutes: z.number().int().min(1).max(1440).default(2),
    avoidNight: z.boolean().default(true),
    delayAfterFailure: z.boolean().default(true),
  })
  .strict();
const metadata = {
  title: z.string().trim().max(120).optional(),
  description: z.string().trim().max(2000).optional(),
};
const actor = {
  actor_id: z.string().regex(/^[1-9][0-9]{0,79}$/),
  actor_type: z.enum(["personal", "page"]),
};
const payloads = {
  create: z
    .object({
      plan: campaignPlanSchema,
      ...metadata,
      settings: campaignSettingsSchema.optional(),
      actor_id: actor.actor_id.optional(),
      actor_type: actor.actor_type.optional(),
    })
    .strict(),
  edit: z
    .object({
      plan: campaignPlanSchema,
      ...metadata,
      settings: campaignSettingsSchema.optional(),
    })
    .strict(),
  validate_one: z
    .object({
      actor_id: actor.actor_id,
      adapter_version: z.enum(["0.3.2", "0.4.0"]),
      reviewed: z.literal(true),
      digest: z.string().regex(/^[a-f0-9]{64}$/),
      target_id: z.uuid(),
    })
    .strict(),
  confirm_validation: z
    .object({
      actor_id: actor.actor_id,
      adapter_version: z.enum(["0.3.2", "0.4.0"]),
      reviewed: z.literal(true),
      digest: z.string().regex(/^[a-f0-9]{64}$/),
      post_url: z
        .string()
        .max(500)
        .regex(
          /^https:\/\/www\.facebook\.com\/groups\/[^/?#]+\/posts\/[0-9]+\/?$/,
        ),
    })
    .strict(),
  inspect: z.object({}).strict(),
  bind_actor: z.object(actor).strict(),
  reserve_media: z
    .object({ position: z.number().int().min(0).max(9) })
    .strict(),
  media_uploaded: z.object({ asset_id: z.uuid() }).strict(),
  approve: z.object({ digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  start: z.object(actor).strict(),
  resume: z.object(actor).strict(),
  claim: z.object(actor).strict(),
  pause: z.object({}).strict(),
  cancel: z.object({}).strict(),
  recover: z.object({}).strict(),
  report: z
    .object({
      attempt_token: z.uuid(),
      provider_code: z
        .string()
        .regex(/^[a-z_]{1,64}$/)
        .optional(),
      outcome: z.enum([
        "live",
        "pending_admin",
        "refused",
        "uncertain",
        "stopped",
      ]),
      post_url: z
        .string()
        .max(500)
        .regex(
          /^https:\/\/www\.facebook\.com\/groups\/[^/?#]+\/posts\/[0-9]+\/?$/,
        )
        .optional(),
    })
    .strict(),
  resolve: z
    .object({
      target_id: z.uuid(),
      reviewed: z.literal(true),
      outcome: z.enum(["live", "pending_admin", "not_sent"]),
      post_url: z
        .string()
        .max(500)
        .regex(
          /^https:\/\/www\.facebook\.com\/groups\/[^/?#]+\/posts\/[0-9]+\/?$/,
        )
        .optional(),
    })
    .strict(),
};
export const campaignCommandSchema = z
  .object({
    id: z.uuid(),
    revision: z.number().int().min(0),
    command: z.enum([
      "create",
      "edit",
      "inspect",
      "validate_one",
      "confirm_validation",
      "bind_actor",
      "reserve_media",
      "media_uploaded",
      "approve",
      "start",
      "resume",
      "claim",
      "pause",
      "cancel",
      "recover",
      "report",
      "resolve",
    ]),
    payload: z.record(z.string(), z.unknown()).default({}),
  })
  .strict()
  .superRefine((value, ctx) => {
    const result = payloads[value.command].safeParse(value.payload);
    if (!result.success)
      ctx.addIssue({
        code: "custom",
        message: result.error.issues[0]?.message ?? "Invalid campaign command",
      });
  });
export const campaignJobSchema = z.object({
  title: z.string().max(120).default(""),
  description: z.string().max(2000).default(""),
  id: z.uuid(),
  user_id: z.uuid(),
  actor_id: z.string().nullable(),
  actor_type: z.enum(["personal", "page"]),
  plan: campaignPlanSchema,
  settings: campaignSettingsSchema,
  state: z.enum([
    "draft",
    "ready",
    "running",
    "paused",
    "blocked",
    "completed",
    "cancelled",
  ]),
  revision: z.number().int().positive(),
  approved_digest: z.string().nullable(),
  digest: z.string(),
  next_eligible_at: z.string(),
  stop_reason: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  targets: z.array(
    z.object({
      id: z.uuid(),
      campaign_id: z.uuid(),
      group_id: z.uuid(),
      position: z.number().int(),
      state: z.enum([
        "queued",
        "claimed",
        "live",
        "pending_admin",
        "refused",
        "uncertain",
        "stopped",
        "not_sent",
      ]),
      attempt_token: z.uuid().nullable(),
      lease_until: z.string().nullable(),
      post_url: z
        .string()
        .regex(
          /^https:\/\/www\.facebook\.com\/groups\/[^/?#]+\/posts\/[0-9]+\/?$/,
        )
        .nullable(),
      receipt_source: z.enum(["extension_report", "user_review"]).nullable(),
      provider_code: z
        .string()
        .regex(/^[a-z_]{1,64}$/)
        .nullable()
        .optional(),
    }),
  ),
  media: z.array(
    z.object({
      id: z.uuid(),
      campaign_id: z.uuid(),
      position: z.number().int(),
      object_path: z.string(),
      manifest: campaignMediaSchema,
      uploaded: z.boolean(),
    }),
  ),
});
export type CampaignJob = z.infer<typeof campaignJobSchema>;
export type CampaignSettings = z.infer<typeof campaignSettingsSchema>;
export type CampaignCommand = z.infer<typeof campaignCommandSchema>;

export const campaignCommandReplySchema = z.object({
  job: campaignJobSchema,
  viewer_id: z.uuid(),
  upload: z
    .object({ path: z.string(), token: z.string(), signedUrl: z.url() })
    .optional(),
});
export const campaignListSchema = z.object({
  viewer_id: z.uuid(),
  campaigns: z.array(
    z.object({
      id: z.uuid(),
      revision: z.number().int(),
      state: z.string(),
      title: z.string().default(""),
      description: z.string().default(""),
      created_at: z.string(),
      plan: z.object({ text: z.string() }),
    }),
  ),
});
export type CampaignList = z.infer<typeof campaignListSchema>;

export const campaignIdSchema = z.uuid();
export const campaignDeleteInputSchema = z
  .object({ id: z.uuid(), revision: z.number().int().positive() })
  .strict();
export const campaignDeleteReplySchema = z.object({
  deleted_id: z.uuid(),
  viewer_id: z.uuid(),
});
export const campaignRestoreSchema = z.object({
  job: campaignJobSchema,
  viewer_id: z.uuid(),
  assets: z.array(z.object({ id: z.uuid(), url: z.url() })),
});

export const campaignActorIdSchema = actor.actor_id;

