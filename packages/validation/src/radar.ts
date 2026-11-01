import { z } from "zod";
export const radarScopeSchema = z
  .string()
  .regex(/^(personal|page):[A-Za-z0-9_-]{1,80}$/);
const terms = z
  .array(z.string().trim().min(1).max(160))
  .max(100)
  .refine(
    (items) => new Set(items).size === items.length,
    "Use each keyword once.",
  );
export const radarRulesSchema = z
  .object({ exact: terms, broad: terms, negative: terms })
  .strict();
export const radarSettingsInputSchema = z
  .object({
    group_ids: z
      .array(z.uuid())
      .max(250)
      .refine((ids) => new Set(ids).size === ids.length),
    keyword_rules: radarRulesSchema,
    scan_interval: z.union([z.literal(15), z.literal(30), z.literal(60)]),
    in_page_notifications: z.boolean(),
    desktop_notifications: z.boolean(),
    reply_preferences: z
      .object({
        style: z.enum(["helpful", "professional", "conversational"]),
        selling: z.enum(["none", "soft", "direct"]),
        directness: z.enum(["gentle", "balanced", "direct"]),
        context: z.string().trim().max(400),
      })
      .strict(),
  })
  .strict();
export const radarSettingsSchema = radarSettingsInputSchema.extend({
  scope: radarScopeSchema,
  user_id: z.uuid(),
  revision: z.number().int().positive(),
  created_at: z.string(),
  updated_at: z.string(),
});
export const radarStageSchema = z.enum([
  "new",
  "replied",
  "conversation",
  "customer",
  "closed",
]);
export const radarLeadSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  scope: radarScopeSchema,
  group_id: z.uuid().nullable(),
  group_identity: z.string(),
  group_name: z.string(),
  post_id: z.string().regex(/^[1-9]\d{0,24}$/),
  url: z.string().url(),
  author: z.string(),
  text: z.string(),
  matched_keywords: z.array(z.string()),
  stage: radarStageSchema,
  is_read: z.boolean(),
  is_starred: z.boolean(),
  note: z.string(),
  revision: z.number().int().positive(),
  discovered_at: z.string(),
  post_created_at: z.string().nullable(),
  updated_at: z.string(),
});
const leadIdentity = {
  scope: radarScopeSchema,
  id: z.uuid(),
  revision: z.number().int().positive(),
};
export const radarCommandSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("save_settings"),
      scope: radarScopeSchema,
      revision: z.number().int().nonnegative(),
      settings: radarSettingsInputSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal("ingest"),
      scope: radarScopeSchema,
      revision: z.number().int().positive(),
      post: z
        .object({
          group_id: z.uuid(),
          post_id: z.string().regex(/^[1-9]\d{0,24}$/),
          author: z.string().trim().max(160),
          text: z.string().trim().min(1).max(20000),
          post_created_at: z.iso.datetime({ offset: true }).nullable(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("update_lead"),
      ...leadIdentity,
      changes: z
        .object({
          stage: radarStageSchema.optional(),
          is_read: z.boolean().optional(),
          is_starred: z.boolean().optional(),
          note: z.string().max(2000).optional(),
        })
        .strict()
        .refine((value) => Object.keys(value).length > 0),
    })
    .strict(),
  z.object({ operation: z.literal("delete_lead"), ...leadIdentity }).strict(),
  z
    .object({
      operation: z.literal("clear"),
      scope: radarScopeSchema,
      before: z.iso.datetime({ offset: true }),
    })
    .strict(),
]);
export type RadarCommand = z.infer<typeof radarCommandSchema>;
export type RadarSettings = z.infer<typeof radarSettingsSchema>;
export type RadarLead = z.infer<typeof radarLeadSchema>;
export const radarReplySchema = z.object({
  settings: radarSettingsSchema.nullable().optional(),
  lead: radarLeadSchema.nullable().optional(),
  matched: z.boolean().optional(),
  duplicate: z.boolean().optional(),
  deleted: z.number().int().nonnegative().optional(),
});
export const radarPageSchema = z.object({
  viewer_id: z.uuid(),
  scope: radarScopeSchema,
  settings: radarSettingsSchema.nullable(),
  leads: z.array(radarLeadSchema).max(100),
  next_cursor: z.string().nullable(),
  server_time: z.iso.datetime({ offset: true }),
  capabilities: z.object({
    scanning: z.literal(false),
    ai: z.literal(false),
    auto_reply: z.literal(false),
    webhooks: z.literal(false),
  }),
});
export function matchRadarText(
  text: string,
  rules: z.infer<typeof radarRulesSchema>,
) {
  const clean = (value: string) =>
    value
      .normalize("NFKC")
      // C0 controls are intentionally folded to spaces to match the reference contract.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[‘’‚‛ʼ′＇]/g, "'")
      .replace(/[“”„‟″＂]/g, '"')
      .replace(/[‐‑‒–—―−]/g, "-")
      .toLowerCase();
  const phrase = (body: string, term: string) =>
    !!term &&
    (/[㐀-鿿豈-﫿぀-ヿ฀-๿຀-໿ក-៿က-႟가-힯]/u.test(term)
      ? body.includes(term)
      : new RegExp(
          `(?<![\\p{L}\\p{N}\\p{M}_])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}\\p{M}_])`,
          "u",
        ).test(body));
  const body = clean(text);
  if (rules.negative.some((term) => phrase(body, clean(term)))) return [];
  return [
    ...new Set([
      ...rules.exact.filter((term) => phrase(body, clean(term))),
      ...rules.broad.filter((term) =>
        clean(term)
          .split(/\s+/u)
          .every((token) => phrase(body, token)),
      ),
    ]),
  ];
}

export const radarCursorSchema = z
  .object({ at: z.iso.datetime({ offset: true }), id: z.uuid() })
  .strict();
export const radarQuerySchema = z
  .object({
    scope: radarScopeSchema,
    search: z.string().trim().max(200).default(""),
    status: z.enum(["all", "unread", "read", "starred"]).default("all"),
    stage: radarStageSchema.optional(),
    keyword: z.string().max(160).optional(),
    cursor: z.string().max(300).optional(),
  })
  .strict();
export type RadarQuery = z.infer<typeof radarQuerySchema>;
