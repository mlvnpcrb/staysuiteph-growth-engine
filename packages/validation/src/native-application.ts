import { z } from "zod";
import { composeEngineOpenSchema } from "./compose-engine";
export const nativeApplicationRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("NATIVE_USER") }).strict(),
  z
    .object({
      type: z.literal("NATIVE_SIGN_IN"),
      email: z.email().max(254),
      password: z.string().min(1).max(1024),
    })
    .strict(),
  z.object({ type: z.literal("NATIVE_SIGN_OUT") }).strict(),
  z
    .object({
      type: z.literal("NATIVE_API"),
      path: z.string().min(1).max(1000),
      method: z.enum(["GET", "POST", "PATCH", "DELETE"]),
      body: z.string().max(96000).optional(),
      viewer: z.uuid(),
    })
    .strict(),
  z.object({ type: z.literal("NATIVE_ENGINE_STATUS") }).strict(),
  z
    .object({
      type: z.literal("NATIVE_ENGINE_OPEN"),
      input: composeEngineOpenSchema,
    })
    .strict(),
  z
    .object({ type: z.literal("NATIVE_SYNC_GROUPS"), viewer: z.uuid() })
    .strict(),
  z
    .object({
      type: z.literal("NATIVE_VALIDATE_ONE"),
      input: composeEngineOpenSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("NATIVE_CONFIRM_VALIDATION"),
      id: z.uuid(),
      revision: z.number().int().positive(),
      digest: z.string().regex(/^[a-f0-9]{64}$/),
      actor_id: z.string().regex(/^[1-9]\d{0,79}$/),
      post_url: z
        .string()
        .regex(
          /^https:\/\/www\.facebook\.com\/groups\/[^/?#]+\/posts\/[0-9]+\/?$/,
        ),
      reviewed: z.literal(true),
    })
    .strict(),
]);
