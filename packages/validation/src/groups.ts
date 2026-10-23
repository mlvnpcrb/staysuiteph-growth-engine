import { z } from "zod";
import { normalizeGroupUrl } from "./group-url";
import { groupContextSchema } from "./group-context";
export { normalizeGroupUrl } from "./group-url";
export { searchGroupsSchema, groupContextSchema } from "./group-context";
import { marketingEvidenceSchema } from "./group-marketing";
export const duplicateCheckSchema = z.object({
  operation: z.literal("check_duplicates"),
  urls: z.array(z.string().max(500)).min(1).max(100),
});
export const addGroupSchema = groupContextSchema.extend({
  url: z
    .string()
    .max(500)
    .transform((s, ctx) => {
      try {
        return normalizeGroupUrl(s).url;
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "Enter a valid Facebook Group URL.",
        });
        return z.NEVER;
      }
    }),
  title: z.string().trim().min(2).max(160),
  evidence: z.string().trim().max(2000).default(""),
});
export const updateGroupSchema = z
  .object({
    id: z.uuid(),
    destination: groupContextSchema.shape.destination.optional(),
    accommodation: groupContextSchema.shape.accommodation.optional(),
    audience: groupContextSchema.shape.audience.optional(),
    confirm_review: z.boolean().default(false),
    notes: z.string().trim().max(4000),
    review_status: z.enum(["review_required", "reviewed", "not_suitable"]),
    rule_evidence: z.string().trim().max(4000),
  })
  .superRefine((s, ctx) => {
    if (s.review_status === "reviewed" && !s.rule_evidence)
      ctx.addIssue({
        code: "custom",
        path: ["rule_evidence"],
        message:
          "Add the rules you personally reviewed before marking reviewed.",
      });
  });
export const deleteGroupSchema = z.object({ id: z.uuid() });
export const savedGroupSchema = z.object({
  marketing_evidence: marketingEvidenceSchema
    .catch(() => marketingEvidenceSchema.parse({}))
    .optional(),
  id: z.uuid(),
  user_id: z.uuid(),
  identity: z.string(),
  url: z.string(),
  title: z.string(),
  destination: z.string(),
  accommodation: z.string(),
  audience: z.string(),
  evidence: z.string(),
  source: z.literal("manual"),
  notes: z.string(),
  review_status: z.enum(["review_required", "reviewed", "not_suitable"]),
  rule_evidence: z.string(),
  last_reviewed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export const groupResponseSchema = z.object({
  viewer_id: z.uuid().optional(),
  identities: z.array(z.string()).optional(),
  groups: z.array(savedGroupSchema).optional(),
  group: savedGroupSchema.optional(),
  stats: z
    .object({
      total: z.number().int().nonnegative(),
      reviewed: z.number().int().nonnegative(),
      needsReview: z.number().int().nonnegative(),
    })
    .optional(),
  duplicate: z.boolean().optional(),
  removed: z.boolean().optional(),
});
