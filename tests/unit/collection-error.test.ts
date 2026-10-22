import { describe, it, expect } from "vitest";
import { collectionError } from "../../apps/extension/lib/collection-error";
describe("privacy-preserving extension diagnostics", () => {
  it.each([
    ["Extension context invalidated", "extension_reloaded"],
    ["No tab with id: 123", "tab_unavailable"],
    ["Cannot access a chrome:// URL", "unsupported_tab"],
    [
      "Cannot access contents of url https://facebook.com/?code=secret. Extension manifest must request permission",
      "browser_permission_denied",
    ],
    ["unknown https://facebook.com/?code=secret", "collection_unavailable"],
  ])(
    "categorizes %s without disclosing raw exceptions",
    (message, category) => {
      const result = collectionError(new Error(message));
      expect(result.category).toBe(category);
      expect(JSON.stringify(result)).not.toContain("code=secret");
    },
  );
  it("does not fabricate a Facebook restriction when the failure is unknown", () => {
    expect(collectionError(null)).toEqual(
      collectionError(new Error("private detail")),
    );
    expect(collectionError(null).message).toContain(
      "no Facebook account restriction has been confirmed",
    );
  });
});
