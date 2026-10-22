import { z } from "zod";
import type { SavedGroup } from "@staysuite/types";
import { normalizeGroupUrl } from "./group-url";
import { searchGroupsSchema } from "./group-context";
import { effectiveReview } from "./group-assessment";
const count = z.number().int().min(0).max(1_000_000).nullable().default(null);
export const marketingEvidenceSchema = z
  .object({
    observed_at: z.iso.datetime().nullable().default(null),
    source_url: z
      .string()
      .max(500)
      .transform((value, ctx) => {
        try {
          return normalizeGroupUrl(value).url;
        } catch {
          ctx.addIssue({
            code: "custom",
            message: "Use a Facebook Group source link.",
          });
          return z.NEVER;
        }
      })
      .nullable()
      .default(null),
    posts_7d: count,
    sample_posts: count,
    sample_comments: count,
    enquiries_30d: count,
    bookings_30d: count,
    promotion_allowed: z.boolean().nullable().default(null),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      [
        value.posts_7d,
        value.sample_posts,
        value.sample_comments,
        value.enquiries_30d,
        value.bookings_30d,
        value.promotion_allowed,
      ].some((v) => v !== null) &&
      (!value.observed_at || !value.source_url)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Record an observation date and source group link for your evidence.",
      });
    if (
      value.posts_7d !== null &&
      value.sample_posts !== null &&
      value.sample_posts > value.posts_7d
    )
      ctx.addIssue({
        code: "custom",
        message: "Sample size cannot exceed the observed 7-day post count.",
      });
    if (
      value.sample_comments !== null &&
      (!value.sample_posts || value.sample_posts < 1)
    )
      ctx.addIssue({
        code: "custom",
        message: "Engagement requires at least one sampled post.",
      });
  });
export const marketingUpdateSchema = z.object({
  id: z.uuid(),
  operation: z.literal("marketing_evidence"),
  marketing_evidence: marketingEvidenceSchema,
});
export type MarketingRanking = {
  score: number | null;
  coverage: number;
  confidence: "moderate" | "low";
  dimensions: {
    name: string;
    points: number | null;
    maximum: number;
    reason: string;
  }[];
  readiness: "blocked" | "needs_review" | "reviewed_permission";
  fresh: boolean;
  explanation: string;
};
export function rankGroupMarketing(
  group: SavedGroup,
  now = Date.now(),
): MarketingRanking {
  const parsed = marketingEvidenceSchema.safeParse(
    group.marketing_evidence ?? {},
  );
  const metrics = parsed.success ? parsed.data : null;
  const sourceMatches =
    !!metrics?.source_url &&
    normalizeGroupUrl(metrics.source_url).identity === group.identity;
  const age = metrics?.observed_at
    ? now - Date.parse(metrics.observed_at)
    : NaN;
  const fresh =
    sourceMatches && Number.isFinite(age) && age >= 0 && age < 7 * 86400000;
  const dimensions: {
    name: string;
    points: number | null;
    maximum: number;
    reason: string;
  }[] = [];
  const context = searchGroupsSchema.safeParse(group);
  const text = `${group.title} ${group.evidence}`.toLocaleLowerCase();
  if (context.success) {
    const c = context.data;
    const match = [
      text.includes(c.destination.toLocaleLowerCase()),
      text.includes(c.accommodation.toLocaleLowerCase()),
      (c.audience === "Hosts"
        ? ["host", "owner", "landlord"]
        : ["guest", "rental", "staycation", "travel"]
      ).some((w) => text.includes(w)),
    ];
    dimensions.push({
      name: "Audience & location fit",
      points: match.filter(Boolean).length * 10,
      maximum: 30,
      reason: `${match.filter(Boolean).length} of 3 context signals match the supplied name/description.`,
    });
  } else
    dimensions.push({
      name: "Audience & location fit",
      points: null,
      maximum: 30,
      reason: "Unknown: add destination, accommodation and audience.",
    });
  function metric(
    name: string,
    maximum: number,
    value: number | null | undefined,
    score: (n: number) => number,
    reason: string,
  ) {
    dimensions.push({
      name,
      maximum,
      points:
        fresh && value !== null && value !== undefined ? score(value) : null,
      reason:
        fresh && value !== null && value !== undefined
          ? reason
          : "Unknown: missing, stale, future-dated or mismatched evidence. Refresh observations within 7 days.",
    });
  }
  metric(
    "Recent activity",
    20,
    metrics?.posts_7d,
    (n) => (n >= 7 ? 20 : n >= 3 ? 12 : n >= 1 ? 6 : 0),
    `${metrics?.posts_7d ?? 0} observed posts in the preceding 7 days.`,
  );
  const average =
    metrics?.sample_posts && metrics.sample_comments !== null
      ? metrics.sample_comments / metrics.sample_posts
      : null;
  metric(
    "Sample engagement",
    20,
    average,
    (n) => (n >= 5 ? 20 : n >= 2 ? 12 : n > 0 ? 6 : 0),
    `${average?.toFixed(1) ?? 0} comments per sampled post; sample size ${metrics?.sample_posts ?? 0}.`,
  );
  metric(
    "Your enquiries",
    15,
    metrics?.enquiries_30d,
    (n) => (n >= 5 ? 15 : n >= 1 ? 8 : 0),
    `${metrics?.enquiries_30d ?? 0} user-attributed enquiries in the preceding 30 days.`,
  );
  metric(
    "Your bookings",
    15,
    metrics?.bookings_30d,
    (n) => (n >= 2 ? 15 : n >= 1 ? 10 : 0),
    `${metrics?.bookings_30d ?? 0} user-attributed bookings in the preceding 30 days.`,
  );
  const coverage = dimensions
    .filter((d) => d.points !== null)
    .reduce((sum, d) => sum + d.maximum, 0);
  const score = coverage
    ? dimensions.reduce((sum, d) => sum + (d.points ?? 0), 0)
    : null;
  const ruleReview = effectiveReview(group, now) === "reviewed";
  const readiness =
    group.review_status === "not_suitable" ||
    (fresh && metrics?.promotion_allowed === false)
      ? "blocked"
      : ruleReview && fresh && metrics?.promotion_allowed === true
        ? "reviewed_permission"
        : "needs_review";
  return {
    score,
    coverage,
    confidence:
      coverage >= 70 && (metrics?.sample_posts ?? 0) >= 10 ? "moderate" : "low",
    dimensions,
    readiness,
    fresh,
    explanation:
      "Transparent heuristic, not predicted bookings or verified Facebook analytics. Unknown dimensions add no points; scores are not rescaled. Counts and permission are user-reported.",
  };
}
