import { z } from "zod";
import { collectedGroupSchema } from "./group-collection";
export const facebookActorSchema = z.string().regex(/^[1-9]\d{0,79}$/);
export const facebookErrorSchema = z.enum([
  "permission_required", "signed_out", "page_profile", "account_changed", "challenge",
  "rate_limited", "access_denied", "network", "unsupported", "malformed_response",
  "repeated_cursor", "limit", "cancelled", "interrupted", "storage", "busy",
]);
export type FacebookError = z.infer<typeof facebookErrorSchema>;
export const facebookDiagnosticSchema = z.object({
  stage: z.enum(["input","page_guard","bootstrap_identity","bootstrap_tokens","request","response_json","response_errors","group_connection","group_nodes","pagination","actor_recheck"]),
  httpStatus: z.number().int().min(100).max(599).nullable(),
  query: z.enum(["initial","pagination"]),
  querySource: z.enum(["page_module","reviewed_fallback"]),
}).strict();
export const facebookPageSchema = z.object({
  actorId: facebookActorSchema,
  actorName: z.string().trim().min(1).max(120),
  groups: z.array(collectedGroupSchema).max(200),
  hasNext: z.boolean(),
  cursor: z.string().min(1).max(4096).nullable(),
}).strict().refine(value => !value.hasNext || value.cursor !== null, "Missing pagination cursor");
export type FacebookPage = z.infer<typeof facebookPageSchema>;
export const facebookLibrarySchema = z.object({
  schema: z.literal(1),
  actorId: facebookActorSchema,
  actorName: z.string().min(1).max(120),
  groups: z.array(collectedGroupSchema).max(5000),
  phase: z.enum(["fetching", "ready", "partial", "error", "cancelled"]),
  pages: z.number().int().min(0).max(100),
  complete: z.boolean(),
  updatedAt: z.iso.datetime(),
  syncedAt: z.iso.datetime().nullable(),
  error: facebookErrorSchema.nullable(),
  runId: z.uuid().nullable(),
  diagnostic: facebookDiagnosticSchema.nullable().optional(),
}).strict();
export type FacebookLibrary = z.infer<typeof facebookLibrarySchema>;
