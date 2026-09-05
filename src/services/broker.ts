import type { Broker } from "./broker-types.js";
import { DatabaseService } from "./database.js";
import { createInMemoryBroker, InMemoryBroker } from "./in-memory-broker.js";
import { createUpstoxClient } from "./upstox.js";

const LIVE_ADAPTER_ID = "upstox";

export interface BrokerSessionStore {
  read(): string | null;
  write(session: string): void;
  clear(): void;
}

export interface LiveBrokerAdapter extends Broker {
  getAccessToken(): string;
}

export type LiveBrokerFactory = (session?: string) => LiveBrokerAdapter;

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
    read: () => withDb((db) => db.getBrokerToken(LIVE_ADAPTER_ID)),
    write: (session) => {
      withDb((db) => {
        db.setBrokerToken(LIVE_ADAPTER_ID, session);
      });
    },
    clear: () => {
      withDb((db) => {
        db.deleteBrokerToken(LIVE_ADAPTER_ID);
      });
    },
  };
}

let sessionStore: BrokerSessionStore = sqliteSessionStore();
let createLive: LiveBrokerFactory = createUpstoxClient;
let activeBroker: Broker | null = null;

export function resetBrokerFactory(options?: {
  sessionStore?: BrokerSessionStore;
  createLive?: LiveBrokerFactory;
}): void {
  sessionStore = options?.sessionStore ?? sqliteSessionStore();
  createLive = options?.createLive ?? createUpstoxClient;
  activeBroker = null;
}

function hydrateLive(): LiveBrokerAdapter {
  const live = createLive(sessionStore.read() ?? undefined);
  activeBroker = live;
  return live;
}

export function getBroker(): Broker {
  if (activeBroker?.isAuthenticated) return activeBroker;
  return hydrateLive();
}

export function setBroker(broker: Broker | null): void {
  activeBroker = broker;
}

export async function connectUpstox(authCode: string): Promise<void> {
  const fresh = createLive();
  await fresh.authenticate(authCode);
  sessionStore.write(fresh.getAccessToken());
  activeBroker = fresh;
}

export function disconnectUpstox(): void {
  sessionStore.clear();
  activeBroker = createLive(undefined);
}

export { createInMemoryBroker, InMemoryBroker };
