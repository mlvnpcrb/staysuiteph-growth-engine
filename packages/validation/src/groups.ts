import { z } from "zod";
export function normalizeGroupUrl(input: string) {
  const url = new URL(input.trim());
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    !["facebook.com", "www.facebook.com", "m.facebook.com"].includes(
      url.hostname,
    )
  )
    throw new Error("Enter a Facebook Group link.");
  const match =
    /^\/groups\/([a-zA-Z0-9._-]{1,160})(?:\/(?:about|posts\/\d+|permalink\/\d+))?\/?$/.exec(
      url.pathname,
    );
  const identity = match?.[1]?.toLowerCase();
  if (
    !identity ||
    [
      "feed",
      "discover",
      "create",
      "search",
      "joins",
      "your_groups",
      "notifications",
    ].includes(identity)
  )
    throw new Error("Enter a specific Facebook Group link.");
  return { identity, url: `https://www.facebook.com/groups/${identity}/` };
}
export const searchGroupsSchema = z.object({
  destination: z.string().trim().min(2).max(100),
  accommodation: z.enum([
    "Condo",
    "Apartment",
    "Hotel",
    "Resort",
    "Vacation rental",
  ]),
  audience: z.enum(["Guests", "Hosts"]),
});
export const groupContextSchema = z.object({
  destination: z
    .string()
    .trim()
    .max(100)
    .refine(
      (value) => value.length === 0 || value.length >= 2,
      "Use at least two characters or leave blank.",
    )
    .default(""),
  accommodation: z
    .enum(["", "Condo", "Apartment", "Hotel", "Resort", "Vacation rental"])
    .default(""),
  audience: z.enum(["", "Guests", "Hosts"]).default(""),
});
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
