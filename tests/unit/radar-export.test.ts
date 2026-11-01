import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  env: vi.fn(),
  client: vi.fn(),
  auth: vi.fn(),
  repo: vi.fn(),
  leads: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ environment: m.env }));
vi.mock("@/lib/supabase", () => ({ supabaseServer: m.client }));
vi.mock("@staysuite/database", () => ({ radarRepository: m.repo }));
import { GET } from "../../apps/web/src/app/api/radar/export/route";
const owner = "11111111-1111-4111-8111-111111111111",
  scope = "personal:12345";
const lead = {
  id: owner,
  user_id: owner,
  scope,
  group_id: null,
  group_identity: "fixture",
  group_name: "Fixture",
  post_id: "123",
  url: "https://www.facebook.com/groups/fixture/posts/123/",
  author: '=HYPERLINK("example")',
  text: 'A quoted "enquiry"\nwith a newline',
  matched_keywords: ["enquiry"],
  stage: "new",
  is_read: false,
  is_starred: false,
  note: "",
  revision: 1,
  discovered_at: "2026-11-01T00:00:00Z",
  post_created_at: null,
  updated_at: "2026-11-01T00:00:00Z",
};
beforeEach(() => {
  vi.resetAllMocks();
  m.env.mockReturnValue({ configured: true });
  m.client.mockResolvedValue({ auth: { getUser: m.auth } });
  m.auth.mockResolvedValue({ data: { user: { id: owner } }, error: null });
  m.repo.mockReturnValue({ leads: m.leads });
  m.leads.mockResolvedValue([]);
});
it("exports matching pages with stable keyset/cutoff, quoted cells and formula neutralization", async () => {
  m.leads
    .mockResolvedValueOnce(Array.from({ length: 101 }, () => lead))
    .mockResolvedValueOnce([lead]);
  const response = await GET(
    new Request(
      `http://localhost/api/radar/export?scope=${scope}&status=starred`,
    ),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("content-type")).toContain("text/csv");
  const text = await response.text();
  expect(text).toContain('"\'=HYPERLINK(""example"")"');
  expect(text).toContain('"A quoted ""enquiry""\nwith a newline"');
  expect(m.leads).toHaveBeenCalledTimes(2);
  expect(m.leads.mock.calls[0]?.[2]).toBe(m.leads.mock.calls[1]?.[2]);
  expect(m.leads.mock.calls[1]?.[1]).toEqual({
    at: lead.discovered_at,
    id: lead.id,
  });
});
it("rejects account switches, anonymous access and injected owner/cursor filters", async () => {
  expect(
    (
      await GET(
        new Request(`http://localhost/api/radar/export?scope=${scope}`, {
          headers: { "x-staysuite-viewer": "other" },
        }),
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await GET(
        new Request(
          `http://localhost/api/radar/export?scope=${scope}&cursor=forged`,
        ),
      )
    ).status,
  ).toBe(400);
  m.auth.mockResolvedValue({ data: { user: null } });
  expect(
    (await GET(new Request(`http://localhost/api/radar/export?scope=${scope}`)))
      .status,
  ).toBe(401);
  expect(m.leads).not.toHaveBeenCalled();
});
it("fails the download if a later page cannot be loaded", async () => {
  m.leads
    .mockResolvedValueOnce(Array.from({ length: 101 }, () => lead))
    .mockRejectedValueOnce(new Error("private storage error"));
  const response = await GET(
    new Request(`http://localhost/api/radar/export?scope=${scope}`),
  );
  await expect(response.text()).rejects.toThrow("Export interrupted");
});
