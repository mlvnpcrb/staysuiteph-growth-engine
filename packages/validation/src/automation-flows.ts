import { z } from "zod";
import { cadenceSchema } from "./schedules";
import {
  campaignJobSchema,
  campaignSettingsSchema,
} from "./campaign-execution";
const stepId = z.uuid();
export const automationStepSchema = z.discriminatedUnion("type", [
  z
    .object({
      id: stepId,
      type: z.literal("trigger"),
      cadence: cadenceSchema.nullable(),
    })
    .strict(),
  z
    .object({
      id: stepId,
      type: z.literal("post"),
      campaign_ids: z
        .array(z.uuid())
        .min(1)
        .max(10)
        .refine(
          (ids) => new Set(ids).size === ids.length,
          "Select each post once per block.",
        ),
    })
    .strict(),
  z
    .object({
      id: stepId,
      type: z.literal("wait"),
      minutes: z.number().int().min(1).max(525600),
    })
    .strict(),
  z
    .object({
      id: stepId,
      type: z.literal("loop"),
      target_id: stepId,
      max_loops: z.number().int().min(1).max(1000).nullable(),
    })
    .strict(),
  z.object({ id: stepId, type: z.literal("stop") }).strict(),
]);
export const automationDefinitionSchema = z
  .object({
    version: z.literal(1),
    steps: z.array(automationStepSchema).min(2).max(30),
  })
  .strict()
  .superRefine((value, ctx) => {
    const steps = value.steps;
    if (
      steps[0]?.type !== "trigger" ||
      steps.slice(1).some((step) => step.type === "trigger")
    )
      ctx.addIssue({
        code: "custom",
        message: "Use one Trigger as the first step.",
      });
    if (new Set(steps.map((step) => step.id)).size !== steps.length)
      ctx.addIssue({
        code: "custom",
        message: "Each step must have a unique identity.",
      });
    if (!steps.some((step) => step.type === "post"))
      ctx.addIssue({ code: "custom", message: "Add at least one Post step." });
    const jobs = new Set(
      steps.flatMap((step) => (step.type === "post" ? step.campaign_ids : [])),
    );
    if (jobs.size > 50)
      ctx.addIssue({
        code: "custom",
        message: "Use up to 50 different posts per automation.",
      });
    steps.forEach((step, index) => {
      if (step.type !== "loop") return;
      const target = steps.findIndex(
        (candidate) => candidate.id === step.target_id,
      );
      if (target < 0 || target >= index)
        ctx.addIssue({
          code: "custom",
          path: ["steps", index, "target_id"],
          message: "Loop back to an earlier step.",
        });
      else if (
        !steps
          .slice(target, index)
          .some((candidate) => candidate.type === "wait")
      )
        ctx.addIssue({
          code: "custom",
          path: ["steps", index],
          message: "Add a Wait inside every loop.",
        });
    });
  });
export type AutomationDefinition = z.infer<typeof automationDefinitionSchema>;
export type AutomationStep = z.infer<typeof automationStepSchema>;
export const automationFlowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  title: z.string().min(1).max(120),
  definition: automationDefinitionSchema,
  state: z.enum(["paused", "enabled", "blocked", "completed"]),
  revision: z.number().int().positive(),
  approved_digest: z.string().nullable(),
  actor_id: z.string().nullable(),
  actor_type: z.enum(["personal", "page"]).nullable(),
  step_index: z.number().int().nonnegative(),
  post_index: z.number().int().nonnegative(),
  loop_counters: z.record(z.string(), z.number().int().nonnegative()),
  next_action_at: z.string().nullable(),
  wait_until: z.string().nullable(),
  occurrence_at: z.string().nullable(),
  cycle_started_at: z.string().nullable(),
  cycle: z.number().int().nonnegative(),
  current_schedule_id: z.uuid().nullable(),
  stop_reason: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  digest: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable()
    .optional(),
});
export type AutomationFlow = z.infer<typeof automationFlowSchema>;
export const automationEventSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  flow_id: z.uuid().nullable(),
  flow_title: z.string(),
  flow_revision: z.number().int().positive(),
  cycle: z.number().int().nonnegative(),
  kind: z.enum([
    "saved",
    "enabled",
    "paused",
    "trigger",
    "post_started",
    "post_completed",
    "wait_started",
    "wait_completed",
    "loop",
    "stop",
    "cycle_completed",
    "completed",
    "missed",
    "blocked",
  ]),
  step_id: z.uuid().nullable(),
  details: z.record(z.string(), z.unknown()),
  created_at: z.string(),
});
export const automationSnapshotSchema = z.object({
  viewer_id: z.uuid(),
  flows: z.array(automationFlowSchema).max(50),
  events: z.array(automationEventSchema).max(20),
});
const identity = { id: z.uuid(), revision: z.number().int().positive() };
export const automationCommandSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("create"),
      title: z.string().trim().min(1).max(120),
      definition: automationDefinitionSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal("save"),
      ...identity,
      title: z.string().trim().min(1).max(120),
      definition: automationDefinitionSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal("enable"),
      ...identity,
      reviewed: z.literal(true),
      digest: z.string().regex(/^[a-f0-9]{64}$/),
      actor_id: z.string().regex(/^[1-9]\d{0,79}$/),
      actor_type: z.enum(["personal", "page"]),
    })
    .strict(),
  z.object({ operation: z.literal("pause"), ...identity }).strict(),
  z.object({ operation: z.literal("delete"), ...identity }).strict(),
]);
export type AutomationCommand = z.infer<typeof automationCommandSchema>;
export const automationReplySchema = z.object({
  flow: automationFlowSchema.nullable(),
  deleted_id: z.uuid().optional(),
});

export const automationPrepareSchema = z
  .object({
    request_id: z.uuid(),
    template_id: z.uuid(),
    template_revision: z.number().int().positive(),
    group_ids: z
      .array(z.uuid())
      .min(1)
      .max(50)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Select each group once.",
      ),
    actor_id: z.string().regex(/^[1-9]\d{0,79}$/),
    actor_type: z.enum(["personal", "page"]),
    interval_minutes: z.number().int().min(1).max(1440),
    settings: campaignSettingsSchema,
  })
  .strict();
export const automationPreparedReplySchema = z.object({
  viewer_id: z.uuid(),
  job: campaignJobSchema,
  prepared: z.object({
    request_id: z.uuid(),
    campaign_id: z.uuid(),
    template_id: z.uuid(),
    template_revision: z.number().int().positive(),
  }),
});
export type AutomationPrepare = z.infer<typeof automationPrepareSchema>;
