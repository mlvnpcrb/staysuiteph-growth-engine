import { z } from "zod";
import { normalizeGroupUrl } from "./groups";

export const collectedGroupSchema = z
  .object({
    url: z
      .string()
      .max(500)
      .transform((value, ctx) => {
        try {
          const path = new URL(value).pathname;
          if (!/^\/groups\/[a-zA-Z0-9._-]{1,160}\/?$/.test(path))
            throw new Error("Group-only links required");
          return normalizeGroupUrl(value).url;
        } catch {
          ctx.addIssue({ code: "custom", message: "Invalid group URL." });
          return z.NEVER;
        }
      }),
    title: z.string().trim().min(2).max(160),
  })
  .strict();
export const groupCollectionSchema = z
  .object({
    format: z.literal("staysuite-visible-groups-v1"),
    collected_at: z.iso.datetime(),
    groups: z.array(collectedGroupSchema).min(1).max(100),
  })
  .strict();
export type GroupCollection = z.infer<typeof groupCollectionSchema>;
export function parseGroupCollection(text: string): GroupCollection {
  if (text.length > 100_000)
    throw new Error("Collection is too large (100 KB maximum).");
  const parsed = groupCollectionSchema.safeParse(JSON.parse(text));
  if (!parsed.success)
    throw new Error(
      "Choose a StaySuite group collection file with 1–100 group names and links.",
    );
  const unique = new Map<string, GroupCollection["groups"][number]>();
  for (const group of parsed.data.groups) unique.set(group.url, group);
  return { ...parsed.data, groups: [...unique.values()] };
}

export const groupTransferSchema = z
  .object({
    type: z.literal("STAYSUITE_GROUP_IMPORT"),
    transfer_id: z.uuid(),
    collection: groupCollectionSchema,
  })
  .strict();
export const groupTransferAckSchema = z
  .object({
    type: z.literal("STAYSUITE_GROUP_IMPORT_ACK"),
    transfer_id: z.uuid(),
    result: z.enum(["received", "busy", "invalid_payload", "batch_limit"]),
  })
  .strict();
export function parseGroupTransfer(value: unknown) {
  const text = JSON.stringify(value);
  if (!text || text.length > 100_000) throw new Error("Transfer exceeds limit");
  return groupTransferSchema.parse(JSON.parse(text));
}
