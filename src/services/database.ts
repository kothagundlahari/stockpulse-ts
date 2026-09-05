import fs from "node:fs";
import path from "node:path";
import SqliteDb from "better-sqlite3";
import type { Fundamentals } from "../types/index.js";

/**
 * SQLite storage for broker auth tokens and fundamentals cache.
 * Uses better-sqlite3 for synchronous, high-performance access.
 */
export class DatabaseService {
  private db: SqliteDb.Database;

  constructor(dbPath: string = "./data/stockpulse.db") {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new SqliteDb(dbPath);
    try {
      fs.chmodSync(dbPath, 0o600);
    } catch {
      // Best-effort: some platforms do not expose chmod
    }
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      DROP TABLE IF EXISTS journal;

      CREATE TABLE IF NOT EXISTS broker_tokens (
        broker TEXT PRIMARY KEY,
        token TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS fundamentals_cache (
        symbol TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  setBrokerToken(broker: string, token: string): void {
    this.db
      .prepare(
        `INSERT INTO broker_tokens (broker, token, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(broker) DO UPDATE SET token = excluded.token, updated_at = datetime('now')`,
      )
      .run(broker, token);
  }

  getBrokerToken(broker: string): string | null {
    const row = this.db.prepare("SELECT token FROM broker_tokens WHERE broker = ?").get(broker) as
      | { token: string }
      | undefined;
    return row?.token ?? null;
  }

  deleteBrokerToken(broker: string): void {
    this.db.prepare("DELETE FROM broker_tokens WHERE broker = ?").run(broker);
  }

  getCachedFundamentals(symbol: string): { data: Fundamentals; updatedAt: number } | null {
    const row = this.db
      .prepare("SELECT data, updated_at FROM fundamentals_cache WHERE symbol = ?")
      .get(symbol) as { data: string; updated_at: number } | undefined;
    if (!row) return null;
    return { data: JSON.parse(row.data) as Fundamentals, updatedAt: row.updated_at };
  }

  getAllCachedFundamentals(): { data: Fundamentals; updatedAt: number }[] {
    const rows = this.db.prepare("SELECT data, updated_at FROM fundamentals_cache").all() as {
      data: string;
      updated_at: number;
    }[];
    return rows.map((r) => ({
      data: JSON.parse(r.data) as Fundamentals,
      updatedAt: r.updated_at,
    }));
  }

  saveFundamentals(items: Fundamentals[], updatedAt: number = Date.now()): void {
    const stmt = this.db.prepare(`
      INSERT INTO fundamentals_cache (symbol, data, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(symbol) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
    `);
    const insertMany = this.db.transaction((records: Fundamentals[]) => {
      for (const item of records) {
        stmt.run(item.symbol, JSON.stringify(item), updatedAt);
      }
    });
    insertMany(items);
  }

  clearFundamentalsCache(): void {
    this.db.prepare("DELETE FROM fundamentals_cache").run();
  }

  close(): void {
    this.db.close();
  }
}
