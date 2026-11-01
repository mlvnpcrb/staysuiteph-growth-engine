import { z } from "zod";
import { postTemplateSchema } from "./templates";
const name = z.string().trim().min(1).max(25);
const groupIds = z
  .array(z.uuid())
  .max(1000)
  .refine((ids) => new Set(ids).size === ids.length, "Select each group once.");
const categoryIds = z
  .array(z.uuid())
  .max(100)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    "Select each category once.",
  );
export const categorySchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  name,
  revision: z.number().int().positive(),
  created_at: z.string(),
  updated_at: z.string(),
});
export const savedGroupCollectionSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  name: z.string().trim().min(1).max(100),
  revision: z.number().int().positive(),
  group_ids: groupIds,
  created_at: z.string(),
  updated_at: z.string(),
});
export const librarySnapshotSchema = z.object({
  viewer_id: z.uuid(),
  categories: z.array(categorySchema).max(100),
  collections: z.array(savedGroupCollectionSchema).max(200),
  assignments: z.array(
    z.object({ template_id: z.uuid(), category_id: z.uuid() }),
  ),
});
export type LibrarySnapshot = z.infer<typeof librarySnapshotSchema>;
export type TemplateCategory = z.infer<typeof categorySchema>;
export type SavedGroupCollection = z.infer<typeof savedGroupCollectionSchema>;
const identity = { id: z.uuid(), revision: z.number().int().positive() };
export const libraryCommandSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("category_create"), name }).strict(),
  z
    .object({ operation: z.literal("category_rename"), ...identity, name })
    .strict(),
  z.object({ operation: z.literal("category_delete"), ...identity }).strict(),
  z
    .object({
      operation: z.literal("collection_create"),
      name: z.string().trim().min(1).max(100),
      group_ids: groupIds,
    })
    .strict(),
  z
    .object({
      operation: z.literal("collection_save"),
      ...identity,
      name: z.string().trim().min(1).max(100),
      group_ids: groupIds,
    })
    .strict(),
  z.object({ operation: z.literal("collection_delete"), ...identity }).strict(),
  z
    .object({ operation: z.literal("collection_duplicate"), ...identity })
    .strict(),
  z
    .object({
      operation: z.literal("collection_split"),
      ...identity,
      size: z.number().int().min(1).max(1000),
    })
    .strict(),
  z
    .object({
      operation: z.literal("template_assign"),
      template_id: z.uuid(),
      revision: z.number().int().positive(),
      category_ids: categoryIds,
    })
    .strict(),
]);
export const libraryReplySchema = z.object({
  snapshot: librarySnapshotSchema,
  template: postTemplateSchema.nullable().optional(),
});

export type LibraryCommand = z.infer<typeof libraryCommandSchema>;
