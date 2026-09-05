import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BrokerSessionStore } from "../src/services/broker.js";
import {
  connectUpstox,
  createInMemoryBroker,
  disconnectUpstox,
  getBroker,
  resetBrokerFactory,
  setBroker,
} from "../src/services/broker.js";
import { UpstoxClient } from "../src/services/upstox.js";

class FakeLiveBroker extends UpstoxClient {
  private session: string | undefined;

  constructor(session?: string) {
    super({
      apiKey: "test",
      apiSecret: "test",
      redirectUri: "http://localhost/callback",
      accessToken: session,
    });
    this.session = session;
  }

  override get isAuthenticated(): boolean {
    return Boolean(this.session);
  }

  override async authenticate(code: string): Promise<void> {
    if (!code) throw new Error("Invalid authorization code");
    this.session = "mock-auth-token";
  }

  override getAccessToken(): string {
    return this.session ?? "";
  }
}

function memorySession(initial: string | null = "stored-token"): BrokerSessionStore & {
  value: string | null;
} {
  const store = {
    value: initial,
    read: () => store.value,
    write: (session: string) => {
      store.value = session;
    },
    clear: () => {
      store.value = null;
    },
  };
  return store;
}

describe("broker factory", () => {
  beforeEach(() => {
    resetBrokerFactory({
      sessionStore: memorySession("stored-token"),
      createLive: (session) => new FakeLiveBroker(session),
    });
  });

  afterEach(() => {
    resetBrokerFactory();
  });

  it("loads a persisted session into the live Broker adapter", () => {
    expect(getBroker().isAuthenticated).toBe(true);
  });

  it("connectUpstox authenticates and persists the live session", async () => {
    const session = memorySession(null);
    resetBrokerFactory({
      sessionStore: session,
      createLive: (value) => new FakeLiveBroker(value),
    });
    await connectUpstox("test-code");
    expect(session.value).toBe("mock-auth-token");
    expect(getBroker().isAuthenticated).toBe(true);
  });

  it("disconnectUpstox clears the session and resets the live adapter", () => {
    const session = memorySession("stored-token");
    resetBrokerFactory({
      sessionStore: session,
      createLive: (value) => new FakeLiveBroker(value),
    });
    disconnectUpstox();
    expect(session.value).toBeNull();
    expect(getBroker().isAuthenticated).toBe(false);
  });

  it("supports setting and getting generic Broker instance", () => {
    const memBroker = createInMemoryBroker();
    setBroker(memBroker);
    expect(getBroker()).toBe(memBroker);
    setBroker(null);
  });
});
