import { describe, expect, it } from "vitest";
import { connectCsrfExpireCookie, connectCsrfSetCookie } from "../src/oauth-state-cookie.js";

describe("Broker-connect CSRF cookie headers", () => {
  it("set header HMAC value is not the CSRF nonce", () => {
    const header = connectCsrfSetCookie("abc");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Max-Age=600");
    const value = /sp_oauth_state=([^;]*)/.exec(header)?.[1];
    expect(value).toBeDefined();
    expect(value).not.toBe("abc");
    expect(value).not.toBe("");
  });

  it("expire header has an empty value and Max-Age=0", () => {
    const header = connectCsrfExpireCookie();
    expect(header.startsWith("sp_oauth_state=;")).toBe(true);
    expect(header).toContain("Max-Age=0");
  });
});
