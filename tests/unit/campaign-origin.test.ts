import { expect, it } from "vitest";
import { campaignDashboardOrigin } from "../../apps/extension/lib/campaign-dashboard";
it("posting connections stay within the named StaySuite Preview scope", () => {
  expect(
    campaignDashboardOrigin(
      "https://staysuiteph-growth-engine-test-mlvnpcrbs-projects.vercel.app/dashboard/campaigns",
    ),
  ).toBe(
    "https://staysuiteph-growth-engine-test-mlvnpcrbs-projects.vercel.app",
  );
  expect(campaignDashboardOrigin("http://127.0.0.1:3020")).toBe(
    "http://127.0.0.1:3020",
  );
  for (const url of [
    "https://unrelated.vercel.app",
    "https://staysuiteph-growth-engine-test-evil.vercel.app",
    "https://staysuiteph-growth-engine-test-mlvnpcrbs-projects.vercel.app.evil.example",
  ])
    expect(() => campaignDashboardOrigin(url)).toThrow();
});
