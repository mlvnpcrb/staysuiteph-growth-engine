import { expect, it, vi } from "vitest";
import {
  scheduledWakeup,
  type ScheduleConnection,
} from "../../apps/extension/lib/schedule-runtime";
const connection: ScheduleConnection = {
  origin:
    "https://staysuiteph-growth-engine-test-mlvnpcrbs-projects.vercel.app",
  tabId: 1,
  actorId: "12345",
  viewer: "11111111-1111-4111-8111-111111111111",
  generation: "22222222-2222-4222-8222-222222222222",
};
it("does not tick or open a workspace after identity changes", async () => {
  const tick = vi.fn(),
    open = vi.fn();
  await expect(
    scheduledWakeup(connection, {
      actor: async () => ({ actor_id: "999", actor_type: "personal" }),
      tick,
      open,
      stillArmed: async () => true,
    }),
  ).rejects.toThrow("identity changed");
  expect(tick).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
});
it("honors cancellation after the server response and opens at most one validated campaign", async () => {
  const id = "33333333-3333-4333-8333-333333333333",
    open = vi.fn();
  const port = {
    actor: async () => ({ actor_id: "12345", actor_type: "personal" as const }),
    tick: async () => [id, connection.viewer],
    open,
    stillArmed: async () => false,
  };
  expect(await scheduledWakeup(connection, port)).toBe("stopped");
  expect(open).not.toHaveBeenCalled();
  expect(
    await scheduledWakeup(connection, {
      ...port,
      stillArmed: async () => true,
    }),
  ).toBe("opened");
  expect(open).toHaveBeenCalledExactlyOnceWith(id);
});
it("rejects arbitrary workspace paths from a malformed dispatch response", async () => {
  const open = vi.fn();
  await expect(
    scheduledWakeup(connection, {
      actor: async () => ({ actor_id: "12345", actor_type: "personal" }),
      tick: async () => ["https://other.example"],
      stillArmed: async () => true,
      open,
    }),
  ).rejects.toThrow();
  expect(open).not.toHaveBeenCalled();
});
