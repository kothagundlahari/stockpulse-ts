import { createHmac } from "node:crypto";

const COOKIE_NAME = "sp_oauth_state";

function hmacKey(): string {
  return process.env.OAUTH_STATE_KEY ?? "stockpulse-local-oauth-state";
}

/** HMAC of the Broker-connect CSRF nonce (never stored raw in the cookie). */
export function signConnectCsrf(state: string): string {
  return createHmac("sha256", hmacKey()).update(state).digest("hex");
}

export function connectCsrfSetCookie(state: string): string {
  return `${COOKIE_NAME}=${signConnectCsrf(state)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`;
}

export function connectCsrfExpireCookie(): string {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/`;
}

export function readConnectCsrfCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, value] = part.trim().split("=");
    if (key === COOKIE_NAME) return value ?? "";
  }
  return null;
}
