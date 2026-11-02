import { templateRepository, TemplateConflictError } from "@staysuite/database";
import {
  templateCommandSchema,
  templateDeleteSchema,
  detectCampaignMediaType,
  type TemplateAsset,
} from "@staysuite/validation";
import { hasSameRequestOrigin } from "./request-origin";
import type { BackendServices } from "./services";
export function createTemplatesHandlers(services: BackendServices) {
  const reply = (body: unknown, status = 200) =>
    Response.json(body, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
  async function handle(request: Request, method: "GET" | "POST" | "DELETE") {
    if (method !== "GET" && !hasSameRequestOrigin(request))
      return reply({ error: "Request origin was not accepted." }, 403);
    if (!services.configured())
      return reply({ error: "Template storage is not connected." }, 503);
    try {
      const client = await services.client();
      const {
        data: { user },
        error,
      } = await client.auth.getUser();
      if (error || !user || user.is_anonymous)
        return reply({ error: "Sign in to manage templates." }, 401);
      const expected = request.headers.get("x-staysuite-viewer");
      if (expected && expected !== user.id)
        return reply({ error: "Your StaySuite account changed. Reload." }, 409);
      const repo = templateRepository(client, user.id);
      const bucket = client.storage.from("template-media");
      const queryId = new URL(request.url).searchParams.get("id");
      if (method === "GET") {
        if (!queryId)
          return reply({ templates: await repo.list(), viewer_id: user.id });
        const parsed = templateDeleteSchema.shape.id.safeParse(queryId);
        if (!parsed.success)
          return reply({ error: "Choose a valid template." }, 400);
        const template = await repo.find(parsed.data);
        if (!template) return reply({ error: "Template not found." }, 404);
        const assets = await Promise.all(
          template.assets
            .filter((asset) => asset.uploaded)
            .map(async (asset) => {
              const signed = await bucket.createSignedUrl(
                asset.object_path,
                300,
              );
              if (signed.error) throw signed.error;
              return { id: asset.id, url: signed.data.signedUrl };
            }),
        );
        return reply({ template, assets, viewer_id: user.id });
      }
      const raw = await request.text();
      if (raw.length > 96000)
        return reply({ error: "Template command is too large." }, 413);
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return reply({ error: "Enter a valid template command." }, 400);
      }
      if (method === "DELETE") {
        const input = templateDeleteSchema.safeParse(body);
        if (!input.success)
          return reply(
            { error: "Choose the template and its current revision." },
            400,
          );
        let template = await repo.find(input.data.id);
        if (!template) return reply({ error: "Template not found." }, 404);
        if (template.revision !== input.data.revision)
          throw new TemplateConflictError();
        if (template.state !== "deleting")
          template = await repo.save(template.id, template.revision, {
            name: template.name,
            text: template.text,
            assets: template.assets,
            state: "deleting",
          });
        if (template.assets.length) {
          const removed = await bucket.remove(
            template.assets.map((asset) => asset.object_path),
          );
          if (removed.error) throw removed.error;
        }
        await repo.remove(template.id, template.revision);
        return reply({ deleted_id: template.id, viewer_id: user.id });
      }
      const input = templateCommandSchema.safeParse(body);
      if (!input.success)
        return reply(
          { error: input.error.issues[0]?.message ?? "Check your template." },
          400,
        );
      const command = input.data;
      if (command.operation === "create") {
        const id = crypto.randomUUID();
        const assets = command.content.assets.map((asset) => ({
          ...asset,
          object_path: `${user.id}/${id}/${asset.id}`,
          uploaded: false,
        }));
        return reply({
          template: await repo.create(
            id,
            command.content.name,
            command.content.text,
            assets,
          ),
          viewer_id: user.id,
        });
      }
      const current = await repo.find(command.id);
      if (!current) return reply({ error: "Template not found." }, 404);
      if (current.revision !== command.revision)
        throw new TemplateConflictError();
      if (current.state === "deleting")
        return reply(
          {
            error: "This template is being deleted. Retry deletion to finish.",
          },
          409,
        );
      if (command.operation === "save") {
        const assets: TemplateAsset[] = [];
        for (const asset of command.content.assets) {
          const prior = current.assets.find((value) => value.id === asset.id);
          if (
            prior &&
            (prior.sha256 !== asset.sha256 ||
              prior.size !== asset.size ||
              prior.content_type !== asset.content_type)
          )
            return reply(
              { error: "Replace changed attachments with a new upload." },
              400,
            );
          assets.push({
            ...asset,
            object_path: `${user.id}/${current.id}/${asset.id}`,
            uploaded: prior?.uploaded ?? false,
          });
        }
        const template = await repo.save(current.id, current.revision, {
          name: command.content.name,
          text: command.content.text,
          assets,
          state: assets.every((asset) => asset.uploaded) ? "ready" : "draft",
        });
        const removed = current.assets.filter(
          (asset) => !assets.some((kept) => kept.id === asset.id),
        );
        if (removed.length) {
          const result = await bucket.remove(
            removed.map((asset) => asset.object_path),
          );
          if (result.error)
            return reply({
              template,
              viewer_id: user.id,
              warning: "Saved. Some removed attachments still need cleanup.",
            });
        }
        return reply({ template, viewer_id: user.id });
      }
      if (command.operation === "upload") {
        const asset = current.assets.find(
          (value) => value.id === command.asset_id,
        );
        if (!asset || asset.uploaded)
          return reply({ error: "Choose a pending attachment." }, 409);
        const signed = await bucket.createSignedUploadUrl(asset.object_path);
        if (signed.error) throw signed.error;
        return reply({
          template: current,
          upload: signed.data,
          viewer_id: user.id,
        });
      }
      if (command.operation === "finalize") {
        for (const asset of current.assets) {
          const downloaded = await bucket.download(asset.object_path);
          if (downloaded.error) throw downloaded.error;
          const blob = downloaded.data;
          if (blob.size !== asset.size)
            return reply(
              {
                error:
                  "Attachment size did not match. Replace it before saving.",
              },
              409,
            );
          const buffer = await blob.arrayBuffer();
          const actual = [
            ...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
          ]
            .map((value) => value.toString(16).padStart(2, "0"))
            .join("");
          if (
            actual !== asset.sha256 ||
            detectCampaignMediaType(new Uint8Array(buffer).subarray(0, 64)) !==
              asset.content_type
          )
            return reply(
              {
                error:
                  "Attachment content did not match. Replace it before saving.",
              },
              409,
            );
        }
        const template = await repo.save(current.id, current.revision, {
          name: current.name,
          text: current.text,
          assets: current.assets.map((asset) => ({ ...asset, uploaded: true })),
          state: "ready",
        });
        return reply({ template, viewer_id: user.id });
      }
      if (current.state !== "ready")
        return reply(
          { error: "Finish saving attachments before duplicating." },
          409,
        );
      const id = crypto.randomUUID();
      const assets = current.assets.map((asset) => ({
        ...asset,
        object_path: `${user.id}/${id}/${asset.id}`,
        uploaded: false,
      }));
      let template = await repo.create(
        id,
        `${current.name.slice(0, 43)} (copy)`,
        current.text,
        assets,
      );
      try {
        for (const asset of current.assets) {
          const copied = await bucket.copy(
            asset.object_path,
            `${user.id}/${id}/${asset.id}`,
          );
          if (copied.error) throw copied.error;
        }
        if (assets.length)
          template = await repo.save(id, template.revision, {
            name: template.name,
            text: template.text,
            assets: assets.map((asset) => ({ ...asset, uploaded: true })),
            state: "ready",
          });
      } catch {
        return reply({
          template,
          viewer_id: user.id,
          warning:
            "The duplicate draft was created, but attachments need to be uploaded again.",
        });
      }
      return reply({ template, viewer_id: user.id });
    } catch (error) {
      const code =
        typeof error === "object" && error && "code" in error
          ? String(error.code)
          : "";
      if (error instanceof TemplateConflictError || code === "40001")
        return reply({ error: "Template changed. Reload before saving." }, 409);
      if (code === "42501")
        return reply(
          { error: "This template is not available to your account." },
          403,
        );
      if (["42P01", "42883", "PGRST205"].includes(code))
        return reply({ error: "Template database setup is pending." }, 503);
      return reply(
        {
          error:
            "Template storage could not complete this operation. Reload before retrying.",
        },
        503,
      );
    }
  }
  const GET = (request: Request) => handle(request, "GET");
  const POST = (request: Request) => handle(request, "POST");
  const DELETE = (request: Request) => handle(request, "DELETE");

  return { GET, POST, DELETE };
}
