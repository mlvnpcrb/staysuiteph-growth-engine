// Only fixed categories may enter authentication logs. Never pass SDK errors,
// request URLs/headers, cookie values, authorization codes, or user data here.
export type OAuthCategory =
  | "oauth_configuration_invalid"
  | "oauth_origin_missing"
  | "oauth_origin_mismatch"
  | "oauth_cookie_write_failed"
  | "oauth_start_failed"
  | "callback_provider_error"
  | "callback_missing_code"
  | "callback_not_configured"
  | "callback_origin_mismatch"
  | "callback_missing_verifier"
  | "callback_verifier_mismatch"
  | "callback_flow_expired"
  | "callback_flow_not_found"
  | "callback_auth_unavailable"
  | "callback_invalid_token_response"
  | "callback_exchange_rejected"
  | "callback_cookie_write_failed"
  | "callback_unexpected_error";

export function logOAuth(category: OAuthCategory) {
  console.info("[auth]", { category });
}

export class AuthCookieWriteError extends Error {
  constructor() {
    super("Authentication cookie persistence failed");
    this.name = "AuthCookieWriteError";
  }
}

export function callbackErrorCategory(
  error: unknown,
  thrown = false,
): OAuthCategory {
  if (error instanceof AuthCookieWriteError)
    return "callback_cookie_write_failed";
  if (typeof error !== "object" || error === null)
    return "callback_unexpected_error";
  const code = "code" in error ? error.code : undefined;
  switch (code) {
    case "pkce_code_verifier_not_found":
      return "callback_missing_verifier";
    case "bad_code_verifier":
      return "callback_verifier_mismatch";
    case "flow_state_expired":
      return "callback_flow_expired";
    case "flow_state_not_found":
      return "callback_flow_not_found";
  }
  const name = "name" in error ? error.name : undefined;
  if (name === "AuthInvalidTokenResponseError")
    return "callback_invalid_token_response";
  const status = "status" in error ? error.status : undefined;
  if (
    name === "AuthRetryableFetchError" ||
    (typeof status === "number" && status >= 500)
  )
    return "callback_auth_unavailable";
  return thrown ? "callback_unexpected_error" : "callback_exchange_rejected";
}
