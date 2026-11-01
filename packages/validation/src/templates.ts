import { z } from "zod";
export const TEMPLATE_MEDIA_LIMIT = 35 * 1024 * 1024;
export const templateAssetInputSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(255),
    content_type: z.enum([
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "video/mp4",
      "video/webm",
      "video/quicktime",
    ]),
    size: z.number().int().positive().max(TEMPLATE_MEDIA_LIMIT),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const templateAssetSchema = templateAssetInputSchema.extend({
  object_path: z.string().max(200),
  uploaded: z.boolean(),
});
export const templateContentSchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    text: z.string().max(12000),
    assets: z.array(templateAssetInputSchema).max(10).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.text.trim() && !value.assets.length)
      ctx.addIssue({
        code: "custom",
        message: "Add post text or an attachment.",
        path: ["text"],
      });
    if (
      new Set(value.assets.map((asset) => asset.id)).size !==
      value.assets.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Attachment IDs must be unique.",
        path: ["assets"],
      });
    if (
      new Set(value.assets.map((asset) => asset.sha256)).size !==
      value.assets.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Remove duplicate attachments.",
        path: ["assets"],
      });
  });
export const postTemplateSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  name: z.string().max(50),
  text: z.string().max(12000),
  assets: z.array(templateAssetSchema).max(10),
  revision: z.number().int().positive(),
  state: z.enum(["draft", "ready", "deleting"]),
  created_at: z.string(),
  updated_at: z.string(),
});
export const templateCommandSchema = z.discriminatedUnion("operation", [
  z
    .object({ operation: z.literal("create"), content: templateContentSchema })
    .strict(),
  z
    .object({
      operation: z.literal("save"),
      id: z.uuid(),
      revision: z.number().int().positive(),
      content: templateContentSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal("upload"),
      id: z.uuid(),
      revision: z.number().int().positive(),
      asset_id: z.uuid(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("finalize"),
      id: z.uuid(),
      revision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("duplicate"),
      id: z.uuid(),
      revision: z.number().int().positive(),
    })
    .strict(),
]);
export const templateDeleteSchema = z
  .object({ id: z.uuid(), revision: z.number().int().positive() })
  .strict();
export const templateListSchema = z.object({
  templates: z.array(postTemplateSchema),
  viewer_id: z.uuid(),
});
export const templateReplySchema = z.object({
  warning: z.string().optional(),
  template: postTemplateSchema,
  viewer_id: z.uuid(),
  assets: z.array(z.object({ id: z.uuid(), url: z.url() })).optional(),
  upload: z.object({ signedUrl: z.url() }).passthrough().optional(),
});
export type PostTemplate = z.infer<typeof postTemplateSchema>;
export type TemplateContent = z.infer<typeof templateContentSchema>;
export type TemplateAsset = z.infer<typeof templateAssetSchema>;
