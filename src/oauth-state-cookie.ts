import { createHmac } from "node:crypto";

export const OAUTH_STATE_COOKIE = "sp_oauth_state";

function hmacKey(): string {
  return process.env.OAUTH_STATE_KEY ?? "stockpulse-local-oauth-state";
}

/** HMAC of the OAuth CSRF state for the HttpOnly cookie (never the raw state). */
export function signOauthStateCookie(state: string): string {
  return createHmac("sha256", hmacKey()).update(state).digest("hex");
}
