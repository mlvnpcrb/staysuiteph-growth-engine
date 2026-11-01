import { templateReplySchema } from "@staysuite/validation";
export async function templateRequest(
  body: unknown,
  viewer: string,
  method = "POST",
) {
  const response = await fetch("/api/templates", {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-staysuite-viewer": viewer,
    },
    body: JSON.stringify(body),
  });
  const data: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data === "object" &&
      data &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : "Template operation failed.",
    );
  if (method === "DELETE") return null;
  return templateReplySchema.parse(data);
}
export async function readTemplate(id: string, signal?: AbortSignal) {
  const response = await fetch(`/api/templates?id=${encodeURIComponent(id)}`, {
    cache: "no-store",
    signal: signal ?? null,
  });
  const body: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      "This template could not be opened. Return to Templates and reload.",
    );
  return templateReplySchema.parse(body);
}
export async function uploadTemplateAsset(signedUrl: string, file: File) {
  const url = new URL(signedUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !url.pathname.startsWith("/storage/v1/object/upload/sign/template-media/")
  )
    throw new Error("Upload destination was not accepted.");
  const data = new FormData();
  data.append("cacheControl", "3600");
  data.append("", file);
  const result = await fetch(url, {
    method: "PUT",
    body: data,
    headers: { "x-upsert": "false" },
    credentials: "omit",
    redirect: "error",
    referrerPolicy: "no-referrer",
  });
  if (!result.ok)
    throw new Error("Attachment upload failed. Reopen the draft to retry.");
}
