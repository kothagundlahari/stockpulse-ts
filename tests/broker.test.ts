import { describe, expect, it, vi } from "vitest";
import { connectUpstox, disconnectUpstox, getUpstoxClient } from "../src/services/broker.js";

let storedToken: string | null = "stored-token";
const mockSetToken = vi.fn((_b: string, tok: string) => {
  storedToken = tok;
});
const mockDeleteToken = vi.fn((_b: string) => {
  storedToken = null;
});

vi.mock("../src/services/database.js", () => ({
  DatabaseService: class {
    getBrokerToken(b: string) {
      return b === "upstox" ? storedToken : null;
    }
    setBrokerToken(b: string, tok: string) {
      mockSetToken(b, tok);
    }
    deleteBrokerToken(b: string) {
      mockDeleteToken(b);
    }
    close() {}
  },
}));

vi.mock("../src/services/upstox.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/upstox.js")>();
  return {
    ...actual,
    createUpstoxClient: (token?: string) => ({
      name: "upstox",
      isAuthenticated: Boolean(token),
      authenticate: vi.fn().mockResolvedValue(undefined),
      getAccessToken: () => "mock-auth-token",
    }),
  };
});

describe("broker factory", () => {
  it("loads a persisted access token into the client", () => {
    const client = getUpstoxClient();
    expect(client.isAuthenticated).toBe(true);
  });

  it("connectUpstox authenticates and persists token", async () => {
    await connectUpstox("test-code");
    expect(mockSetToken).toHaveBeenCalledWith("upstox", "mock-auth-token");
  });

  it("disconnectUpstox deletes token and resets client", () => {
    disconnectUpstox();
    expect(mockDeleteToken).toHaveBeenCalledWith("upstox");
    const client = getUpstoxClient();
    expect(client.isAuthenticated).toBe(false);
  });
});
