import { describe, expect, it } from "vitest";
import {
  campaignApprovalSnapshot,
  campaignGroupBlockers,
  campaignPlanSchema,
  detectCampaignMediaType,
  type CampaignPlan,
} from "@staysuite/validation";
import type { SavedGroup } from "@staysuite/types";
const group: SavedGroup = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  identity: "fixture",
  url: "https://www.facebook.com/groups/fixture/",
  title: "Demo Staycation",
  destination: "",
  accommodation: "",
  audience: "",
  evidence: "",
  source: "manual",
  notes: "",
  review_status: "review_required",
  rule_evidence: "",
  last_reviewed_at: null,
  created_at: "2026-10-23T00:00:00Z",
  updated_at: "2026-10-23T00:00:00Z",
};
const plan: CampaignPlan = {
  version: 1,
  text: "Demo accommodation offer",
  intervalMinutes: 15,
  groupIds: [group.id],
  media: [],
};
const photo = {
  name: "room.png",
  type: "image/png" as const,
  size: 1000,
  sha256: "a".repeat(64),
};
describe("campaign preparation", () => {
  it("binds exact text, media, ordered targets, account and rule versions", () => {
    const original = campaignApprovalSnapshot(plan, [group]);
    for (const changed of [
      { ...plan, text: plan.text + " " },
      { ...plan, intervalMinutes: 30 },
      { ...plan, media: [photo] },
    ])
      expect(campaignApprovalSnapshot(changed, [group])).not.toBe(original);
    for (const changed of [
      { ...group, user_id: "33333333-3333-4333-8333-333333333333" },
      { ...group, rule_evidence: "Changed rules" },
      { ...group, updated_at: "2026-10-24T00:00:00Z" },
    ])
      expect(campaignApprovalSnapshot(plan, [changed])).not.toBe(original);
    const other = { ...group, id: "33333333-3333-4333-8333-333333333333" };
    expect(
      campaignApprovalSnapshot({ ...plan, groupIds: [group.id, other.id] }, [
        group,
        other,
      ]),
    ).not.toBe(
      campaignApprovalSnapshot({ ...plan, groupIds: [other.id, group.id] }, [
        group,
        other,
      ]),
    );
    expect(() => campaignApprovalSnapshot(plan, [])).toThrow(
      "no longer available",
    );
  });
  it("rejects duplicate targets/media, excess attachments, mixed video and unsafe intervals", () => {
    for (const changed of [
      { ...plan, groupIds: [group.id, group.id] },
      { ...plan, media: [photo, photo] },
      {
        ...plan,
        media: Array.from({ length: 11 }, (_, i) => ({
          ...photo,
          sha256: String(i).padStart(64, "a"),
        })),
      },
      { ...plan, intervalMinutes: 0 },
      { ...plan, intervalMinutes: 1.5 },
      {
        ...plan,
        media: [photo, { ...photo, type: "video/mp4", sha256: "b".repeat(64) }],
      },
      {
        ...plan,
        media: [
          { ...photo, size: 50 * 1024 * 1024 },
          { ...photo, sha256: "b".repeat(64) },
        ],
      },
    ])
      expect(campaignPlanSchema.safeParse(changed).success).toBe(false);
  });
  it("requires fresh rule and permission evidence and never treats review as publication", () => {
    const now = Date.parse("2026-10-23T05:00:00Z");
    expect(campaignGroupBlockers(group, now)).toHaveLength(1);
    const reviewed = {
      ...group,
      review_status: "reviewed" as const,
      rule_evidence: "Promotions allowed with admin review",
      last_reviewed_at: "2026-10-22T00:00:00Z",
      marketing_evidence: {
        observed_at: "2026-10-22T00:00:00Z",
        source_url: group.url,
        promotion_allowed: true,
        posts_7d: null,
        sample_posts: null,
        sample_comments: null,
        enquiries_30d: null,
        bookings_30d: null,
      },
    };
    expect(campaignGroupBlockers(reviewed, now)).toEqual([]);
    expect(
      campaignGroupBlockers(
        { ...reviewed, review_status: "not_suitable" },
        now,
      ),
    ).toHaveLength(1);
    expect(campaignGroupBlockers(reviewed, now + 8 * 86400000)).toHaveLength(1);
  });
  it("sniffs supported file signatures and rejects HTML/SVG even with misleading filenames", () => {
    expect(
      detectCampaignMediaType(
        new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      ),
    ).toBe("image/png");
    expect(detectCampaignMediaType(new Uint8Array([255, 216, 255]))).toBe(
      "image/jpeg",
    );
    expect(detectCampaignMediaType(new TextEncoder().encode("GIF89a"))).toBe(
      "image/gif",
    );
    expect(
      detectCampaignMediaType(new TextEncoder().encode("RIFF0000WEBP")),
    ).toBe("image/webp");
    expect(
      detectCampaignMediaType(new TextEncoder().encode("0000ftypmp42")),
    ).toBe("video/mp4");
    expect(
      detectCampaignMediaType(new TextEncoder().encode("0000ftypqt  ")),
    ).toBe("video/quicktime");
    for (const text of [
      "<svg onload='alert(1)'/>",
      "<html>pretend.png</html>",
      "",
      "0000ftypavif",
    ])
      expect(
        detectCampaignMediaType(new TextEncoder().encode(text)),
      ).toBeNull();
  });
});
