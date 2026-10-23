import { expect, it } from "vitest";
import { postingDiagnostics } from "../../apps/extension/lib/posting-diagnostics";
import { campaignJobSchema } from "@staysuite/validation";
it("posting diagnostics contain only bounded states and codes, never draft or account data", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const job = campaignJobSchema.parse({
    id,
    user_id: id,
    title: "Private title",
    description: "Private notes",
    actor_id: "12345",
    actor_type: "personal",
    plan: {
      version: 1,
      text: "Private offer",
      intervalMinutes: 15,
      groupIds: [id],
      media: [],
    },
    settings: {},
    state: "blocked",
    revision: 1,
    approved_digest: null,
    digest: "a".repeat(64),
    next_eligible_at: new Date().toISOString(),
    stop_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    media: [],
    targets: [
      {
        id,
        campaign_id: id,
        group_id: id,
        position: 0,
        state: "stopped",
        attempt_token: id,
        lease_until: null,
        post_url: null,
        receipt_source: "extension_report",
        provider_code: "existing_draft",
      },
    ],
  });
  const data = postingDiagnostics(job),
    json = JSON.stringify(data);
  expect(data.targets).toEqual([
    { position: 0, state: "stopped", code: "existing_draft" },
  ]);
  for (const value of [
    id,
    "12345",
    "Private title",
    "Private notes",
    "Private offer",
    "attempt_token",
    "post_url",
  ])
    expect(json).not.toContain(value);
});
