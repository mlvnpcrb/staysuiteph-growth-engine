import { describe, it, expect } from "vitest";
import { appendCollection, restoreCollectionDraft, DRAFT_TTL_MS } from "../../apps/extension/lib/collection-batch";
import type { GroupCollection } from "@staysuite/validation";
const group = (id: string) => ({ url: `https://www.facebook.com/groups/${id}/`, title: `Group ${id}` });
const batch = (ids: string[]): GroupCollection => ({ format: "staysuite-visible-groups-v1", collected_at: "2026-10-23T00:00:00Z", groups: ids.map(group) });
describe("extension collection batches", () => {
  it("adds later visible groups without losing earlier groups or deselections", () => {
    const first = batch(["one", "two"]);
    const next = appendCollection(first, batch(["two", "three"]), new Set([group("one").url]));
    expect(next.collection.groups).toEqual([group("one"), group("two"), group("three")]);
    expect([...next.selected]).toEqual([group("one").url, group("three").url]);
    expect(next.added).toBe(1);
    expect(appendCollection(next.collection, batch(["two"]), next.selected).added).toBe(0);
  });
  it("enforces the existing 100-group transfer boundary without discarding the old batch", () => {
    const first = batch(Array.from({ length: 99 }, (_, i) => `g${i}`));
    const next = appendCollection(first, batch(["new1", "new2"]), new Set());
    expect(next.collection.groups).toHaveLength(100);
    expect(next.added).toBe(1);
    expect(next.overflow).toBe(1);
  });
  it("restores only validated, current drafts for the same dashboard", () => {
    const origin = "https://staysuite.vercel.app";
    const draft = { origin, saved_at: 1000, collection: batch(["one"]), selected: [group("one").url, "https://evil.test/"] };
    expect([...restoreCollectionDraft(draft, origin, 1001)!.selected]).toEqual([group("one").url]);
    expect(restoreCollectionDraft(draft, "https://other.vercel.app", 1001)).toBeNull();
    expect(restoreCollectionDraft(draft, origin, 1000 + DRAFT_TTL_MS)).toBeNull();
    expect(restoreCollectionDraft(draft, origin, 999)).toBeNull();
    expect(restoreCollectionDraft({ ...draft, collection: { ...draft.collection, groups: [{ ...group("one"), cookies: "no" }] } }, origin, 1001)).toBeNull();
    expect(restoreCollectionDraft(null, origin)).toBeNull();
  });
});
