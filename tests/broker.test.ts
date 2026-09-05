import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BrokerSessionStore } from "../src/services/broker.js";
import {
  connectUpstox,
  createInMemoryBroker,
  disconnectUpstox,
  getBroker,
  getUpstoxClient,
  resetBrokerFactory,
  setBroker,
} from "../src/services/broker.js";
import { UpstoxClient } from "../src/services/upstox.js";

class FakeLiveBroker extends UpstoxClient {
  private token: string | undefined;

  constructor(token?: string) {
    super({
      apiKey: "test",
      apiSecret: "test",
      redirectUri: "http://localhost/callback",
      accessToken: token,
    });
    this.token = token;
  }

  override get isAuthenticated(): boolean {
    return Boolean(this.token);
  }

  override async authenticate(code: string): Promise<void> {
    if (!code) throw new Error("Invalid authorization code");
    this.token = "mock-auth-token";
  }

  override getAccessToken(): string {
    return this.token ?? "";
  }
}

function memorySession(initial: string | null = "stored-token"): BrokerSessionStore & {
  value: string | null;
} {
  const store = {
    value: initial,
    getToken: () => store.value,
    setToken: (token: string) => {
      store.value = token;
    },
    deleteToken: () => {
      store.value = null;
    },
  };
  return store;
}

describe("broker factory", () => {
  beforeEach(() => {
    resetBrokerFactory({
      sessionStore: memorySession("stored-token"),
      createLive: (token) => new FakeLiveBroker(token),
    });
  });

  afterEach(() => {
    resetBrokerFactory();
  });

  it("loads a persisted access token into the live Broker adapter", () => {
    const client = getUpstoxClient();
    expect(client.isAuthenticated).toBe(true);
    expect(getBroker().isAuthenticated).toBe(true);
  });

  it("connectUpstox authenticates and persists token", async () => {
    const session = memorySession(null);
    resetBrokerFactory({
      sessionStore: session,
      createLive: (token) => new FakeLiveBroker(token),
    });
    await connectUpstox("test-code");
    expect(session.value).toBe("mock-auth-token");
    expect(getBroker().isAuthenticated).toBe(true);
  });

  it("disconnectUpstox deletes token and resets client", () => {
    const session = memorySession("stored-token");
    resetBrokerFactory({
      sessionStore: session,
      createLive: (token) => new FakeLiveBroker(token),
    });
    disconnectUpstox();
    expect(session.value).toBeNull();
    expect(getUpstoxClient().isAuthenticated).toBe(false);
  });

  it("supports setting and getting generic Broker instance", () => {
    const memBroker = createInMemoryBroker();
    setBroker(memBroker);
    expect(getBroker()).toBe(memBroker);
    setBroker(null);
  });
});
