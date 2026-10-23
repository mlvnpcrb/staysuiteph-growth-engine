import { facebookErrorSchema, type FacebookError } from "@staysuite/validation";
export const facebookMessages: Record<FacebookError, string> = {
  facebook_error: "Facebook returned an application error. Collection stopped. Download diagnostics for the error code.",
  permission_required: "Allow Facebook site access and local identity-cookie access to connect.",
  signed_out: "Sign in to Facebook in this browser, then connect again.",
  page_profile: "Facebook is acting as a Page. Switch to your personal profile, then reconnect.",
  account_changed: "Your Facebook account or session changed. Collection stopped; reconnect.",
  challenge: "Facebook is showing a login check or restriction. Review it directly in Facebook before reconnecting.",
  rate_limited: "Facebook limited this request. Collection stopped; try again later.",
  access_denied: "Facebook denied group-list access. Review your Facebook session before retrying.",
  network: "The Facebook request could not complete. Check Facebook and retry.",
  unsupported: "Facebook’s current group-list interface is not compatible with this experimental connection. No scrolling fallback was used.",
  malformed_response: "Facebook returned an unrecognized group-list response. Collection stopped.",
  repeated_cursor: "Facebook repeated a pagination cursor. The collected list is partial.",
  limit: "Reached the collection limit. The collected list is partial.",
  cancelled: "Collection cancelled. Previously saved groups remain available.",
  interrupted: "Collection was interrupted. Refresh to retry; the saved list may be incomplete.",
  storage: "The extension could not save its local library. Check extension storage and retry.",
  busy: "A collection is already running. Wait for it to finish or stop it first.",
};
export class FacebookFailure extends Error {
  constructor(public readonly code: FacebookError) { super(facebookMessages[code]); }
}
export function facebookCode(error: unknown): FacebookError {
  const value = error instanceof FacebookFailure ? error.code : null;
  const parsed = facebookErrorSchema.safeParse(value);
  return parsed.success ? parsed.data : "network";
}
