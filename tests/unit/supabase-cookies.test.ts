import { beforeEach, expect, it, vi } from "vitest";
import { AuthCookieWriteError } from "../../apps/web/src/lib/oauth-diagnostics";
const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  database: vi.fn(),
  set: vi.fn(),
  getAll: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/env", () => ({
  environment: () => ({
    url: "https://project.supabase.co",
    key: "sb_publishable_fixture",
  }),
}));
vi.mock("@staysuite/database", () => ({ serverDatabase: mocks.database }));
import { supabaseServer } from "../../apps/web/src/lib/supabase";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.cookies.mockResolvedValue({ getAll: mocks.getAll, set: mocks.set });
});
it("forwards all SDK cookie values and attributes to the Next cookie store", async () => {
  await supabaseServer({ requireCookieWrites: true });
  const adapter = mocks.database.mock.calls[0]![2];
  const cookie = {
    name: "fixture-cookie",
    value: "fixture-value",
    options: { path: "/", sameSite: "lax", maxAge: 300 },
  };
  adapter.setAll([cookie]);
  expect(mocks.set).toHaveBeenCalledWith(
    cookie.name,
    cookie.value,
    cookie.options,
  );
  adapter.getAll();
  expect(mocks.getAll).toHaveBeenCalledOnce();
});
it("surfaces cookie write failure during OAuth instead of implying persistence", async () => {
  mocks.set.mockImplementation(() => {
    throw new Error("sensitive internal details");
  });
  await supabaseServer({ requireCookieWrites: true });
  const adapter = mocks.database.mock.calls[0]![2];
  expect(() =>
    adapter.setAll([{ name: "fixture", value: "fixture", options: {} }]),
  ).toThrow(AuthCookieWriteError);
});
it("retains the read-only Server Component adapter behavior", async () => {
  mocks.set.mockImplementation(() => {
    throw new Error("read-only cookies");
  });
  await supabaseServer();
  expect(() =>
    mocks.database.mock.calls[0]![2].setAll([
      { name: "fixture", value: "fixture", options: {} },
    ]),
  ).not.toThrow();
});
