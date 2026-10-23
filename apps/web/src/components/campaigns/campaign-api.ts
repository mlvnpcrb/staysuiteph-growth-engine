import {
  campaignCommandReplySchema,
  type CampaignCommand,
} from "@staysuite/validation";
export class CampaignApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function campaignCommand(input: CampaignCommand, viewer?: string) {
  const response = await fetch("/api/campaigns", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(viewer ? { "x-staysuite-viewer": viewer } : {}),
    },
    body: JSON.stringify(input),
  });
  const result: unknown = await response.json();
  if (!response.ok)
    throw new CampaignApiError(
      typeof result === "object" &&
      result &&
      "error" in result &&
      typeof result.error === "string"
        ? result.error
        : "Campaign operation failed. Reload before retrying.",
      response.status,
    );
  const parsed = campaignCommandReplySchema.parse(result);
  if (viewer && parsed.viewer_id !== viewer)
    throw new Error("Your StaySuite account changed. Reconnect.");
  return parsed;
}

export async function uploadCampaignMedia(signedUrl: string, bytes: Blob) {
  const url = new URL(signedUrl);
  if (
    url.username ||
    url.password ||
    !url.pathname.startsWith(
      "/storage/v1/object/upload/sign/campaign-media/",
    ) ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(url.hostname))
    )
  )
    throw new Error("Media upload destination is invalid.");
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", bytes);
  const response = await fetch(url, {
    method: "PUT",
    body: form,
    headers: { "x-upsert": "false" },
    credentials: "omit",
    redirect: "error",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok)
    throw new Error(
      "Media upload was not confirmed. Refresh the saved campaign before retrying.",
    );
}
