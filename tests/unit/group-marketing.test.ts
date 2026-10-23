import { describe, it, expect } from "vitest";
import {
  rankGroupMarketing,
  marketingEvidenceSchema,
  savedGroupSchema,
} from "@staysuite/validation";
import type { SavedGroup } from "@staysuite/types";
const now = Date.parse("2026-10-23T04:00:00Z");
const group: SavedGroup = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "11111111-1111-4111-8111-111111111111",
  identity: "fixture",
  url: "https://www.facebook.com/groups/fixture/",
  title: "Cebu condo guests",
  destination: "Cebu",
  accommodation: "Condo",
  audience: "Guests",
  evidence: "",
  source: "manual",
  notes: "Keep",
  review_status: "reviewed",
  rule_evidence: "Promotions allowed with admin approval",
  last_reviewed_at: "2026-10-22T04:00:00Z",
  created_at: "2026-10-20T04:00:00Z",
  updated_at: "2026-10-22T04:00:00Z",
};
const full = marketingEvidenceSchema.parse({
  observed_at: "2026-10-22T04:00:00Z",
  source_url: group.url,
  posts_7d: 14,
  sample_posts: 10,
  sample_comments: 50,
  enquiries_30d: 5,
  bookings_30d: 2,
  promotion_allowed: true,
});
describe("evidence-based marketing ranking", () => {
  it("explains a complete high score while separating permission and outcomes from predictions", () => {
    const report = rankGroupMarketing(
      { ...group, marketing_evidence: full },
      now,
    );
    expect(report.score).toBe(100);
    expect(report.coverage).toBe(100);
    expect(report.dimensions).toHaveLength(5);
    expect(report.confidence).toBe("moderate");
    expect(report.readiness).toBe("reviewed_permission");
  });
  it("does not boost or normalize missing evidence", () => {
    const report = rankGroupMarketing(group, now);
    expect(report.score).toBe(30);
    expect(report.coverage).toBe(30);
    expect(report.dimensions.slice(1).every((d) => d.points === null)).toBe(
      true,
    );
    expect(report.readiness).toBe("needs_review");
    expect(
      rankGroupMarketing(
        { ...group, destination: "", accommodation: "", audience: "" },
        now,
      ).score,
    ).toBeNull();
  });
  it.each(["2026-10-16T04:00:00Z", "2026-10-24T04:00:00Z"])(
    "excludes stale/future observations %s",
    (date) => {
      const report = rankGroupMarketing(
        { ...group, marketing_evidence: { ...full, observed_at: date } },
        now,
      );
      expect(report.score).toBe(30);
      expect(report.fresh).toBe(false);
      expect(report.readiness).toBe("needs_review");
    },
  );
  it("requires matching evidence source and fresh existing rule review", () => {
    expect(
      rankGroupMarketing(
        {
          ...group,
          marketing_evidence: {
            ...full,
            source_url: "https://www.facebook.com/groups/other/",
          },
        },
        now,
      ).score,
    ).toBe(30);
    expect(
      rankGroupMarketing(
        {
          ...group,
          marketing_evidence: full,
          last_reviewed_at: "2026-01-01T00:00:00Z",
        },
        now,
      ).readiness,
    ).toBe("needs_review");
    expect(
      rankGroupMarketing(
        { ...group, marketing_evidence: full, review_status: "not_suitable" },
        now,
      ).readiness,
    ).toBe("blocked");
    expect(
      rankGroupMarketing(
        { ...group, marketing_evidence: { ...full, promotion_allowed: false } },
        now,
      ).readiness,
    ).toBe("blocked");
  });
  it("distinguishes measured zero from unknown and keeps small samples low confidence", () => {
    const report = rankGroupMarketing(
      {
        ...group,
        marketing_evidence: {
          ...full,
          posts_7d: 1,
          sample_comments: 0,
          enquiries_30d: 0,
          bookings_30d: 0,
          sample_posts: 1,
        },
      },
      now,
    );
    expect(report.score).toBe(36);
    expect(report.coverage).toBe(100);
    expect(report.confidence).toBe("low");
  });
  it("rejects private fields, invalid counts, missing citations and unsupported URLs", () => {
    for (const value of [
      { ...full, member_names: ["private"] },
      { ...full, posts_7d: -1 },
      { ...full, posts_7d: 1.5 },
      { ...full, sample_posts: 0 },
      { ...full, posts_7d: 1, sample_posts: 10 },
      { ...full, source_url: "https://evil.test/" },
      { ...full, observed_at: null },
    ])
      expect(marketingEvidenceSchema.safeParse(value).success).toBe(false);
  });
  it("ignores malformed stored evidence without breaking the saved-group list", () => {
    const row = savedGroupSchema.parse({
      ...group,
      marketing_evidence: { unexpected: "ignored" },
    });
    expect(rankGroupMarketing(row, now).score).toBe(30);
  });
});

describe("available-evidence posting recommendations", () => {
  it("separates accommodation fit, referrals, mixed interests and unrelated names", async () => {
    const { assessPostingPriority: assess } = await import("@staysuite/validation");
    const input = { ...group, destination: "", accommodation: "", audience: "", review_status: "review_required" as const, last_reviewed_at: null };
    expect(assess({...input, title:"Airbnb Bacolod Staycation"},now).priority).toBe(4);
    expect(assess({...input, title:"One Regis Airbnb Owners"},now).priority).toBe(2);
    expect(assess({...input, title:"AIRBNB BACOLOD buy sell houses installment"},now).priority).toBe(1);
    expect(assess({...input, title:"Computer Club"},now).priority).toBe(0);
    expect(rankGroupMarketing({...input,title:"Airbnb Bacolod Staycation"},now).score).toBeNull();
    expect(assess({...input, title:"Airbnb",review_status:"not_suitable"},now).label).toBe("Do not shortlist for posting");
  });
});
