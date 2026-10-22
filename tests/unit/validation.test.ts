import { describe, expect, it } from "vitest";
import {
  bearerToken,
  profileSchema,
  publicEnvironmentSchema,
  safeDashboardUrl,
  signInSchema,
  syncSnapshotSchema,
} from "@staysuite/validation";
import { navigation } from "@staysuite/types";
describe("authentication and contracts", () => {
  it.each([
    null,
    "",
    "Basic abc",
    "Bearer ",
    "Bearer token extra",
    "Bearer token\n",
  ])("rejects malformed token %s", (header) => {
    expect(bearerToken(header)).toBeNull();
  });
  it("extracts bearer credentials without trusting identity fields", () => {
    expect(bearerToken("Bearer signed-token")).toBe("signed-token");
  });
  it("validates credentials and profile boundaries", () => {
    expect(
      signInSchema.safeParse({ email: "invalid", password: "tiny" }).success,
    ).toBe(false);
    expect(
      signInSchema.safeParse({
        email: "host@example.com",
        password: "long-enough-password",
      }).success,
    ).toBe(true);
    expect(
      profileSchema.safeParse({ display_name: " ".repeat(3) }).success,
    ).toBe(false);
    expect(
      profileSchema.safeParse({ display_name: "a".repeat(81) }).success,
    ).toBe(false);
  });
  it("requires secure public backend configuration", () => {
    expect(
      publicEnvironmentSchema.safeParse({
        url: "http://untrusted.example",
        key: "key",
      }).success,
    ).toBe(false);
    expect(
      publicEnvironmentSchema.safeParse({
        url: "http://127.0.0.1:54321",
        key: "key",
      }).success,
    ).toBe(true);
  });
  it.each([
    "javascript:alert(1)",
    "http://example.com",
    "https://user:pass@example.com",
  ])("rejects unsafe dashboard URL %s", (url) => {
    expect(() => safeDashboardUrl(url)).toThrow();
  });
  it("normalizes dashboard destinations", () => {
    expect(safeDashboardUrl("https://app.example.com/path?next=evil")).toBe(
      "https://app.example.com",
    );
  });
  it("rejects fabricated connected sync states", () => {
    expect(
      syncSnapshotSchema.safeParse({
        userId: "8d6ede44-6f74-4dad-a117-3ce9281b4678",
        serverTime: new Date().toISOString(),
        integration: "connected",
      }).success,
    ).toBe(false);
  });
  it("defines all ten distinct sections", () => {
    expect(navigation).toHaveLength(10);
    expect(new Set(navigation.map((item) => item.slug)).size).toBe(10);
  });
});
