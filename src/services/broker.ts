import { DatabaseService } from "./database.js";
import { createUpstoxClient, type UpstoxClient } from "./upstox.js";

let client: UpstoxClient | null = null;

export function getUpstoxClient(): UpstoxClient {
  if (client?.isAuthenticated) return client;
  const db = new DatabaseService();
  const token = db.getBrokerToken("upstox");
  db.close();
  client = createUpstoxClient(token ?? undefined);
  return client;
}

export async function connectUpstox(authCode: string): Promise<void> {
  const fresh = createUpstoxClient();
  await fresh.authenticate(authCode);
  const token = fresh.getAccessToken();
  const db = new DatabaseService();
  db.setBrokerToken("upstox", token);
  db.close();
  client = fresh;
}
