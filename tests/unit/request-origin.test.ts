import { expect, it } from "vitest";
import { hasSameRequestOrigin } from "../../apps/web/src/lib/request-origin";
it("accepts the browser host when Next uses a different internal bind hostname", () => {
  expect(
    hasSameRequestOrigin(
      new Request("http://localhost:3020/api/campaigns", {
        headers: { host: "127.0.0.1:3020", origin: "http://127.0.0.1:3020" },
      }),
    ),
  ).toBe(true);
  expect(
    hasSameRequestOrigin(
      new Request("https://internal.invalid/api/campaigns", {
        headers: {
          host: "preview.vercel.app",
          origin: "https://preview.vercel.app",
        },
      }),
    ),
  ).toBe(true);
});
it("rejects foreign origins, protocol changes, malformed origins and forwarded-host spoofing", () => {
  for (const origin of [
    "https://evil.example",
    "https://127.0.0.1:3020",
    "null",
    "http://127.0.0.1:3020/",
    "http://user@127.0.0.1:3020",
    "not a URL",
  ])
    expect(
      hasSameRequestOrigin(
        new Request("http://localhost:3020/api/campaigns", {
          headers: {
            host: "127.0.0.1:3020",
            origin,
            "x-forwarded-host": "evil.example",
          },
        }),
      ),
    ).toBe(false);
  expect(
    hasSameRequestOrigin(
      new Request("http://localhost:3020/api/campaigns", {
        headers: {
          host: "127.0.0.1:3020",
          "x-forwarded-host": "evil.example",
          origin: "http://evil.example",
        },
      }),
    ),
  ).toBe(false);
  expect(
    hasSameRequestOrigin(new Request("http://localhost:3020/api/campaigns")),
  ).toBe(false);
});
