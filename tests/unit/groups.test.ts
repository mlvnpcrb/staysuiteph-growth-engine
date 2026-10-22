import { expect, it } from "vitest";
import {
  normalizeGroupUrl,
  discoveryLinks,
  assessGroup,
  effectiveReview,
  groupOverview,
  addGroupSchema,
  updateGroupSchema,
} from "../../packages/validation/src";
import type { SavedGroup } from "../../packages/types/src";
const search = {
  destination: "Cebu City",
  accommodation: "Condo",
  audience: "Guests",
} as const;
it.each([
  "https://www.facebook.com/groups/CebuHosts/?ref=share#x",
  "http://m.facebook.com/groups/cebuhosts/about",
  "https://facebook.com/groups/CebuHosts/posts/123",
])("canonicalizes variants %s", (url) =>
  expect(normalizeGroupUrl(url)).toEqual({
    identity: "cebuhosts",
    url: "https://www.facebook.com/groups/cebuhosts/",
  }),
);
it.each([
  "https://facebook.com.evil.com/groups/a",
  "javascript:alert(1)",
  "https://facebook.com/groups/",
  "https://facebook.com/groups/feed",
  "https://user:pass@facebook.com/groups/a",
  "https://facebook.com:444/groups/a",
  "https://facebook.com/groups/a%2fb",
  "https://fb.me/a",
])("rejects unsupported URL %s", (url) =>
  expect(() => normalizeGroupUrl(url)).toThrow(),
);
it("generates bounded user-opened discovery links without fetching or inventing results", () => {
  const links = discoveryLinks(search);
  expect(new URL(links.facebook).searchParams.get("q")).toContain("Cebu City");
  expect(new URL(links.web).searchParams.get("q")).toContain(
    "site:facebook.com/groups/",
  );
});
it("honestly assesses only supplied text and preserves unknowns", () => {
  const result = assessGroup(
    { title: "Cebu City Condo Rentals", evidence: "User-provided description" },
    search,
  );
  expect(result.mode).toBe("rule_based");
  expect(result.score).toBe(100);
  expect(result.unknowns.join(" ")).toMatch(/not been independently verified/);
  expect(result.unknowns.join(" ")).toMatch(/posting permissions are unknown/);
  expect(assessGroup({ title: "Unrelated", evidence: "" }, search).score).toBe(
    0,
  );
});
it("validates manual entry and requires evidence for a reviewed status", () => {
  expect(
    addGroupSchema.safeParse({
      ...search,
      url: "https://evil.com",
      title: "Group",
    }).success,
  ).toBe(false);
  expect(
    updateGroupSchema.safeParse({
      id: "11111111-1111-4111-8111-111111111111",
      notes: "",
      review_status: "reviewed",
      rule_evidence: "",
    }).success,
  ).toBe(false);
});
it("marks stale, missing and future reviews as requiring review", () => {
  const base = {
    review_status: "reviewed",
    rule_evidence: "Evidence",
    last_reviewed_at: new Date().toISOString(),
  } as const;
  expect(effectiveReview(base)).toBe("reviewed");
  expect(
    effectiveReview({ ...base, last_reviewed_at: "2020-01-01T00:00:00Z" }),
  ).toBe("review_required");
  expect(
    effectiveReview({ ...base, last_reviewed_at: "2099-01-01T00:00:00Z" }),
  ).toBe("review_required");
  expect(effectiveReview({ ...base, rule_evidence: "" })).toBe(
    "review_required",
  );
});
it("calculates actual local totals and recent ordering without inventing metrics", () => {
  const now = Date.now();
  const base = {
    review_status: "review_required",
    rule_evidence: "",
    last_reviewed_at: null,
  } as const;
  const groups = [
    { ...base, id: "a", updated_at: "2026-01-01" },
    {
      ...base,
      id: "b",
      updated_at: "2026-01-02",
      review_status: "reviewed",
      rule_evidence: "A rule",
      last_reviewed_at: new Date(now).toISOString(),
    },
  ] as SavedGroup[];
  const stats = groupOverview(groups, now);
  expect(stats.total).toBe(2);
  expect(stats.needsReview).toBe(1);
  expect(stats.reviewed).toBe(1);
  expect(stats.recent[0]?.id).toBe("b");
});
