import { describe, it, expect, vi, afterEach } from "vitest";
import { parseGroupTransfer } from "@staysuite/validation";
import { sendToDashboard } from "../../apps/extension/lib/send-to-dashboard";
const collection = {
  format: "staysuite-visible-groups-v1" as const,
  collected_at: "2026-10-23T00:00:00Z",
  groups: [
    { url: "https://www.facebook.com/groups/test/", title: "Test group" },
  ],
};
const packet = {
  type: "STAYSUITE_GROUP_IMPORT",
  transfer_id: "11111111-1111-4111-8111-111111111111",
  collection,
};
afterEach(() => vi.unstubAllGlobals());
describe("untrusted dashboard transfer", () => {
  it("validates bounded names and canonical URLs without accepting ownership", () => {
    expect(parseGroupTransfer(packet).collection.groups).toEqual(
      collection.groups,
    );
    expect(() =>
      parseGroupTransfer({ ...packet, user_id: "forged" }),
    ).toThrow();
    expect(() =>
      parseGroupTransfer({
        ...packet,
        collection: { ...collection, access_token: "secret" },
      }),
    ).toThrow();
    expect(() =>
      parseGroupTransfer({
        ...packet,
        collection: {
          ...collection,
          groups: [{ ...collection.groups[0], url: "https://evil.test/" }],
        },
      }),
    ).toThrow();
    expect(() =>
      parseGroupTransfer({ ...packet, padding: "a".repeat(100_001) }),
    ).toThrow();
  });
  function chromeMock(allowed = true, result = "received") {
    const api = {
      permissions: { request: vi.fn().mockResolvedValue(allowed) },
      tabs: {
        query: vi.fn().mockResolvedValue([
          {
            id: 7,
            status: "complete",
            url: "https://app.vercel.app/dashboard/group-finder",
          },
        ]),
        create: vi.fn(),
        get: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
      scripting: {
        executeScript: vi.fn().mockResolvedValue([{ result: { result } }]),
      },
    };
    vi.stubGlobal("chrome", api);
    return api;
  }
  it("requests only the configured dashboard origin and transfers no auth fields", async () => {
    const api = chromeMock();
    expect(await sendToDashboard(collection, "https://app.vercel.app")).toEqual(
      { count: 1 },
    );
    expect(api.permissions.request).toHaveBeenCalledWith({
      origins: ["https://app.vercel.app/*"],
    });
    const injection = api.scripting.executeScript.mock.calls[0]?.[0];
    expect(injection.target).toEqual({ tabId: 7 });
    expect(injection.world).toBe("ISOLATED");
    expect(injection.args[0].collection).toEqual(collection);
    expect(JSON.stringify(injection.args)).not.toMatch(
      /cookie|token|user_id|password/,
    );
  });
  it("does not read tabs or inject after permission denial", async () => {
    const api = chromeMock(false);
    await expect(
      sendToDashboard(collection, "https://app.vercel.app"),
    ).rejects.toThrow("dashboard_permission_denied");
    expect(api.tabs.query).not.toHaveBeenCalled();
    expect(api.scripting.executeScript).not.toHaveBeenCalled();
  });
  it.each(["busy", "batch_limit", "invalid_payload"])(
    "reports receiver rejection %s",
    async (result) => {
      chromeMock(true, result);
      await expect(
        sendToDashboard(collection, "https://app.vercel.app"),
      ).rejects.toThrow(result);
    },
  );
  it("does not treat a login page or missing receiver as import success", async () => {
    chromeMock(true, "not_ready");
    await expect(
      sendToDashboard(collection, "https://app.vercel.app"),
    ).rejects.toThrow("dashboard_not_ready");
  });
});

it("uses Chrome host patterns but checks exact origin and local port before tab reuse", async () => {
  const api = {
    permissions: { request: vi.fn().mockResolvedValue(true) },
    tabs: {
      query: vi
        .fn()
        .mockResolvedValue([
          {
            id: 1,
            status: "complete",
            url: "http://localhost:4000/dashboard/group-finder",
          },
        ]),
      create: vi.fn().mockResolvedValue({ id: 2, status: "complete" }),
      update: vi.fn().mockResolvedValue({}),
    },
    scripting: {
      executeScript: vi
        .fn()
        .mockResolvedValue([{ result: { result: "received" } }]),
    },
  };
  vi.stubGlobal("chrome", api);
  await sendToDashboard(collection, "http://localhost:3000");
  expect(api.permissions.request).toHaveBeenCalledWith({
    origins: ["http://localhost/*"],
  });
  expect(api.tabs.create).toHaveBeenCalledWith({
    url: "http://localhost:3000/dashboard/group-finder",
    active: false,
  });
  expect(api.scripting.executeScript.mock.calls[0]?.[0].target).toEqual({
    tabId: 2,
  });
});
