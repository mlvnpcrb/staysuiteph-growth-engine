import { describe, it, expect } from "vitest";
import { parseGroupCollection, assessGroup } from "@staysuite/validation";
const valid = {
  format: "staysuite-visible-groups-v1",
  collected_at: "2026-10-22T10:00:00Z",
  groups: [
    {
      url: "https://m.facebook.com/groups/CebuCondo/?ref=share",
      title: "Cebu condo guests",
    },
  ],
};
describe("untrusted group collection imports", () => {
  it("normalizes URLs, removes tracking and deduplicates without trusting ownership", () => {
    const result = parseGroupCollection(
      JSON.stringify({
        ...valid,
        groups: [
          ...valid.groups,
          {
            url: "https://www.facebook.com/groups/cebucondo/",
            title: "Cebu condo guests",
          },
        ],
      }),
    );
    expect(result.groups).toEqual([
      {
        url: "https://www.facebook.com/groups/cebucondo/",
        title: "Cebu condo guests",
      },
    ]);
  });
  it.each([
    "https://evil.test/groups/1/",
    "javascript:alert(1)",
    "https://facebook.com.evil.test/groups/1/",
    "https://facebook.com/groups/joins/",
    "https://facebook.com/groups/1/posts/22/?x=1#secret",
  ])("rejects unsafe/directory/post export URL %s", (url) => {
    expect(() =>
      parseGroupCollection(
        JSON.stringify({ ...valid, groups: [{ url, title: "Test group" }] }),
      ),
    ).toThrow();
  });
  it("rejects extra fields, credentials and out-of-bounds input", () => {
    for (const data of [
      { ...valid, user_id: "forged" },
      { ...valid, groups: [{ ...valid.groups[0], cookies: "secret" }] },
      { ...valid, groups: [] },
      { ...valid, groups: Array(101).fill(valid.groups[0]) },
    ])
      expect(() => parseGroupCollection(JSON.stringify(data))).toThrow();
    expect(() => parseGroupCollection(" ".repeat(100001))).toThrow();
    expect(() => parseGroupCollection("not json")).toThrow();
  });
  it("assesses names as supplied text without implying verified rules", () => {
    const group = parseGroupCollection(JSON.stringify(valid)).groups[0]!;
    const result = assessGroup(
      { ...group, evidence: "" },
      { destination: "Cebu", accommodation: "Condo", audience: "Guests" },
    );
    expect(result.score).toBeGreaterThan(0);
    expect(result.mode).toBe("rule_based");
    expect(result.unknowns.join(" ")).toMatch(/rules|permission/i);
  });
});
