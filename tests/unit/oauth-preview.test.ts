import { expect, it } from "vitest";
import { oauthTrustedOrigins } from "../../apps/web/src/lib/oauth-origin";
const deployment =
  "staysuiteph-growth-engine-abc123-mlvnpcrbs-projects.vercel.app";
const branch =
  "staysuiteph-growth-engine-git-feat-ph-004ea4-mlvnpcrbs-projects.vercel.app";
const preview = {
  vercel: true,
  vercelEnvironment: "preview",
  deploymentUrl: deployment,
  branchUrl: branch,
  siteUrl: "https://old-branch.vercel.app",
};
it("trusts only this deployment and its branch alias, ignoring stale SITE_URL", () => {
  expect(oauthTrustedOrigins(preview)).toEqual([
    `https://${deployment}`,
    `https://${branch}`,
  ]);
  expect(oauthTrustedOrigins(preview)).not.toContain(preview.siteUrl);
});
it("keeps production and local origins fixed even with Preview metadata present", () => {
  expect(
    oauthTrustedOrigins({
      ...preview,
      vercelEnvironment: "production",
      siteUrl: "https://staysuite.example",
    }),
  ).toEqual(["https://staysuite.example"]);
  expect(
    oauthTrustedOrigins({
      ...preview,
      vercel: false,
      siteUrl: "http://localhost:3000",
    }),
  ).toEqual(["http://localhost:3000"]);
});
it.each([
  undefined,
  "",
  "https://evil.vercel.app",
  "evil.com",
  "a.vercel.app.evil.com",
  "a.vercel.app/path",
  "user@a.vercel.app",
  "a.vercel.app:443",
  "a.vercel.app?x=1",
  "a.vercel.app#x",
  "-bad.vercel.app",
  "bad_.vercel.app",
  "a.b.vercel.app",
])(
  "rejects malformed deployment metadata %s without falling back to a stale site",
  (host) => {
    expect(
      oauthTrustedOrigins({
        ...preview,
        deploymentUrl: host,
        branchUrl: undefined,
      }),
    ).toEqual([]);
  },
);
it("allows one valid metadata origin if the other is unavailable", () => {
  expect(oauthTrustedOrigins({ ...preview, branchUrl: undefined })).toEqual([
    `https://${deployment}`,
  ]);
  expect(oauthTrustedOrigins({ ...preview, deploymentUrl: undefined })).toEqual(
    [`https://${branch}`],
  );
});
