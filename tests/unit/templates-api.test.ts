import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  env: vi.fn(),
  client: vi.fn(),
  getUser: vi.fn(),
  repo: vi.fn(),
  list: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  download: vi.fn(),
  signed: vi.fn(),
  clean: vi.fn(),
  copy: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ environment: m.env }));
vi.mock("@/lib/supabase", () => ({ supabaseServer: m.client }));
vi.mock("@staysuite/database", () => ({
  templateRepository: m.repo,
  TemplateConflictError: class extends Error {},
}));
import { GET, POST, DELETE } from "../../apps/web/src/app/api/templates/route";
const owner = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222",
  assetId = "33333333-3333-4333-8333-333333333333";
const template = {
  id,
  user_id: owner,
  name: "Template",
  text: "Hello",
  assets: [],
  revision: 1,
  state: "ready",
  created_at: "2026-11-01",
  updated_at: "2026-11-01",
};
const req = (body: unknown, origin = "http://localhost", viewer = owner) =>
  new Request("http://localhost/api/templates", {
    method: "POST",
    headers: {
      origin,
      "Content-Type": "application/json",
      "x-staysuite-viewer": viewer,
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  m.env.mockReturnValue({ configured: true });
  m.client.mockResolvedValue({
    auth: { getUser: m.getUser },
    storage: {
      from: () => ({
        createSignedUploadUrl: m.signed,
        download: m.download,
        remove: m.clean,
        copy: m.copy,
      }),
    },
  });
  m.getUser.mockResolvedValue({ data: { user: { id: owner } }, error: null });
  m.repo.mockReturnValue({
    list: m.list,
    find: m.find,
    create: m.create,
    save: m.save,
    remove: m.remove,
  });
  m.find.mockResolvedValue(template);
  m.save.mockImplementation(async (_id, _rev, content) => ({
    ...template,
    ...content,
    revision: 2,
  }));
  m.clean.mockResolvedValue({ error: null });
});
it("rejects cross origin, anonymous and changed viewer requests", async () => {
  expect((await POST(req({}, "https://other.test"))).status).toBe(403);
  expect((await POST(req({}, "http://localhost", id))).status).toBe(409);
  for (const user of [null, { id: owner, is_anonymous: true }]) {
    m.getUser.mockResolvedValue({ data: { user }, error: null });
    expect((await POST(req({}))).status).toBe(401);
  }
  expect(m.repo).not.toHaveBeenCalled();
});
it("lists only the session owner's private templates", async () => {
  m.list.mockResolvedValue([template]);
  const result = await GET(new Request("http://localhost/api/templates"));
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toContain("no-store");
  expect(await result.json()).toEqual({
    templates: [template],
    viewer_id: owner,
  });
  expect(m.repo).toHaveBeenCalledWith(expect.anything(), owner);
});
it("assigns identity and storage paths on the server", async () => {
  m.create.mockResolvedValue(template);
  expect(
    (
      await POST(
        req({
          operation: "create",
          content: { name: "Saved", text: "Body", assets: [] },
        }),
      )
    ).status,
  ).toBe(200);
  expect(m.create).toHaveBeenCalledWith(
    expect.any(String),
    "Saved",
    "Body",
    [],
  );
  expect(
    (
      await POST(
        req({
          operation: "create",
          content: { name: "Saved", text: "Body", assets: [], user_id: id },
        }),
      )
    ).status,
  ).toBe(400);
});
it("returns missing or stale resources without writing", async () => {
  m.find.mockResolvedValue(null);
  expect(
    (await POST(req({ operation: "duplicate", id, revision: 1 }))).status,
  ).toBe(404);
  m.find.mockResolvedValue({ ...template, revision: 2 });
  expect(
    (await POST(req({ operation: "duplicate", id, revision: 1 }))).status,
  ).toBe(409);
  expect(m.create).not.toHaveBeenCalled();
});
it("verifies uploaded bytes before marking attachments ready", async () => {
  const asset = {
    id: assetId,
    name: "photo.png",
    content_type: "image/png",
    size: 8,
    sha256: "a".repeat(64),
    object_path: `${owner}/${id}/${assetId}`,
    uploaded: false,
  };
  m.find.mockResolvedValue({ ...template, state: "draft", assets: [asset] });
  m.download.mockResolvedValue({
    data: new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])]),
    error: null,
  });
  expect(
    (await POST(req({ operation: "finalize", id, revision: 1 }))).status,
  ).toBe(409);
  expect(m.save).not.toHaveBeenCalled();
});
it("marks deleting before cleanup and does not delete the row when storage fails", async () => {
  const asset = { id: assetId, object_path: `${owner}/${id}/${assetId}` };
  m.find.mockResolvedValue({ ...template, assets: [asset] });
  m.clean.mockResolvedValue({ error: { message: "private details" } });
  const response = await DELETE(req({ id, revision: 1 }));
  expect(response.status).toBe(503);
  expect(m.save).toHaveBeenCalledWith(
    id,
    1,
    expect.objectContaining({ state: "deleting" }),
  );
  expect(m.remove).not.toHaveBeenCalled();
  expect(JSON.stringify(await response.json())).not.toContain(
    "private details",
  );
});
it("allows cleanup retries of deleting rows without another revision update", async () => {
  m.find.mockResolvedValue({ ...template, state: "deleting", revision: 2 });
  expect((await DELETE(req({ id, revision: 2 }))).status).toBe(200);
  expect(m.save).not.toHaveBeenCalled();
  expect(m.remove).toHaveBeenCalledWith(id, 2);
});
it("finalizes matching media and saves its verified metadata", async () => {
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const sha256 = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
  const asset = {
    id: assetId,
    name: "photo.png",
    content_type: "image/png",
    size: bytes.length,
    sha256,
    object_path: `${owner}/${id}/${assetId}`,
    uploaded: false,
  };
  m.find.mockResolvedValue({ ...template, state: "draft", assets: [asset] });
  m.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
  expect(
    (await POST(req({ operation: "finalize", id, revision: 1 }))).status,
  ).toBe(200);
  expect(m.save).toHaveBeenCalledWith(
    id,
    1,
    expect.objectContaining({
      state: "ready",
      assets: [{ ...asset, uploaded: true }],
    }),
  );
});
it("reserves only a pending asset and rejects unreserved upload IDs", async () => {
  m.find.mockResolvedValue({
    ...template,
    state: "draft",
    assets: [
      {
        id: assetId,
        uploaded: false,
        object_path: `${owner}/${id}/${assetId}`,
      },
    ],
  });
  m.signed.mockResolvedValue({
    data: { signedUrl: "https://storage.test/upload" },
    error: null,
  });
  expect(
    (
      await POST(
        req({ operation: "upload", id, revision: 1, asset_id: assetId }),
      )
    ).status,
  ).toBe(200);
  expect(m.signed).toHaveBeenCalledWith(`${owner}/${id}/${assetId}`);
  expect(
    (await POST(req({ operation: "upload", id, revision: 1, asset_id: id })))
      .status,
  ).toBe(409);
});
