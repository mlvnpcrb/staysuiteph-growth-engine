import { expect, it } from "vitest";
import { navigation } from "../../packages/types/src";
it("matches the ZIP primary navigation and excludes custom product sections", () => {
  expect(
    navigation
      .filter((item) => item.category === "primary")
      .map((item) => item.label),
  ).toEqual(["Compose", "Templates", "Automations", "Lead Radar", "Activity"]);
  for (const removed of ["overview", "analytics"])
    expect(navigation.map((item) => item.slug)).not.toContain(removed);
  expect(
    navigation
      .filter((item) => item.availability === "planned")
      .map((item) => item.slug),
  ).toEqual(["lead-radar", "group-finder", "ai-post-studio"]);
  expect(new Set(navigation.map((item) => item.slug)).size).toBe(
    navigation.length,
  );
});
