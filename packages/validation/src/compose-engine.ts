import { z } from "zod";
import { scheduleConnectionSchema } from "./schedules";
export const COMPOSE_ENGINE_CHANNEL = "staysuite-compose-engine-v1";
export const COMPOSE_ENGINE_CONNECTION =
  "staysuite-compose-engine-connection-v1";
export const COMPOSE_ENGINE_LAUNCH = "staysuite-compose-engine-launch-v1:";
export const COMPOSE_ENGINE_RUN = "staysuite-compose-engine-run-v1:";
export const composeEngineConnectionSchema = scheduleConnectionSchema
  .extend({
    connected_at: z.number().int().nonnegative(),
    mode: z.literal("native").optional(),
  })
  .strict();
export const composeEngineOpenSchema = z
  .object({
    request_id: z.uuid(),
    campaign_id: z.uuid(),
    revision: z.number().int().positive(),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    actor_id: z.string().regex(/^[1-9]\d{0,79}$/),
    actor_type: z.literal("personal"),
    viewer_id: z.uuid(),
    reviewed: z.literal(true),
  })
  .strict();
export const composeEngineRequestSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("COMPOSE_ENGINE_CONNECT"),
      connection: scheduleConnectionSchema,
    })
    .strict(),
  z
    .object({ type: z.literal("COMPOSE_ENGINE_STATUS"), generation: z.uuid() })
    .strict(),
  z
    .object({
      type: z.literal("COMPOSE_ENGINE_OPEN"),
      generation: z.uuid(),
      input: composeEngineOpenSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("COMPOSE_ENGINE_TAKE"),
      request_id: z.uuid(),
      engine_tab_id: z.number().int().nonnegative(),
    })
    .strict(),
]);
export const composeEngineStatusSchema = z
  .object({
    viewer_id: z.uuid(),
    actor_id: z.string().regex(/^[1-9]\d{0,79}$/),
    actor_type: z.literal("personal"),
    actor_name: z.string().min(1).max(160).optional(),
    publisher_ready: z.boolean(),
    version: z.string().max(30),
  })
  .strict();
export const composeEngineLaunchSchema = z
  .object({
    input: composeEngineOpenSchema,
    connection: composeEngineConnectionSchema,
    engine_tab_id: z.number().int().nonnegative().nullable(),
    claimed: z.boolean(),
    created_at: z.number().int().nonnegative(),
  })
  .strict();
export type ComposeEngineOpen = z.infer<typeof composeEngineOpenSchema>;
export type ComposeEngineStatus = z.infer<typeof composeEngineStatusSchema>;
export type ComposeEngineLaunch = z.infer<typeof composeEngineLaunchSchema>;
export type ComposeEngineConnection = z.infer<
  typeof composeEngineConnectionSchema
>;
export const composeEngineRunSchema = z
  .object({
    input: composeEngineOpenSchema,
    connection: composeEngineConnectionSchema,
    state: z.enum(["starting", "running", "done", "stopped"]),
    created_at: z.number().int().nonnegative(),
    error: z.string().max(500).nullable(),
  })
  .strict();
export type ComposeEngineRun = z.infer<typeof composeEngineRunSchema>;
