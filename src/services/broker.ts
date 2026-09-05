import type { Broker } from "./broker-types.js";
import { DatabaseService } from "./database.js";
import { createInMemoryBroker, InMemoryBroker } from "./in-memory-broker.js";
import { createUpstoxClient, UpstoxClient } from "./upstox.js";

const LIVE_BROKER_KEY = "upstox";

export interface BrokerSessionStore {
  getToken(): string | null;
  setToken(token: string): void;
  deleteToken(): void;
}

export type LiveBrokerFactory = (token?: string) => UpstoxClient;

function sqliteSessionStore(): BrokerSessionStore {
  const withDb = <T>(fn: (db: DatabaseService) => T): T => {
    const db = new DatabaseService();
    try {
      return fn(db);
    } finally {
      db.close();
    }
  };
  return {
    getToken: () => withDb((db) => db.getBrokerToken(LIVE_BROKER_KEY)),
    setToken: (token) => {
      withDb((db) => {
        db.setBrokerToken(LIVE_BROKER_KEY, token);
      });
    },
    deleteToken: () => {
      withDb((db) => {
        db.deleteBrokerToken(LIVE_BROKER_KEY);
      });
    },
  };
}

let sessionStore: BrokerSessionStore = sqliteSessionStore();
let createLive: LiveBrokerFactory = createUpstoxClient;
let client: UpstoxClient | null = null;
let activeBroker: Broker | null = null;

export function resetBrokerFactory(options?: {
  sessionStore?: BrokerSessionStore;
  createLive?: LiveBrokerFactory;
}): void {
  sessionStore = options?.sessionStore ?? sqliteSessionStore();
  createLive = options?.createLive ?? createUpstoxClient;
  client = null;
  activeBroker = null;
}

function hydrateLive(): UpstoxClient {
  const token = sessionStore.getToken();
  client = createLive(token ?? undefined);
  activeBroker = client;
  return client;
}

export function getBroker(): Broker {
  if (activeBroker?.isAuthenticated) return activeBroker;
  return hydrateLive();
}

export function setBroker(broker: Broker | null): void {
  activeBroker = broker;
  if (broker instanceof UpstoxClient) {
    client = broker;
  }
}

export function getUpstoxClient(): UpstoxClient {
  if (client?.isAuthenticated) return client;
  return hydrateLive();
}

export async function connectUpstox(authCode: string): Promise<void> {
  const fresh = createLive();
  await fresh.authenticate(authCode);
  sessionStore.setToken(fresh.getAccessToken());
  client = fresh;
  activeBroker = fresh;
}

export function disconnectUpstox(): void {
  sessionStore.deleteToken();
  client = createLive(undefined);
  activeBroker = client;
}

export { createInMemoryBroker, InMemoryBroker };
