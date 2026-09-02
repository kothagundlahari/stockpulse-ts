import SqliteDb from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { JournalEntry } from "../types/index.js";

/**
 * SQLite storage for trade journal and screeners.
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
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS journal (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        date TEXT NOT NULL,
        action TEXT NOT NULL CHECK (action IN ('BUY', 'SELL')),
        price REAL NOT NULL,
        quantity INTEGER NOT NULL,
        pnl REAL,
        notes TEXT,
        emotions TEXT,
        lessons TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS screeners (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        criteria TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  addJournalEntry(entry: JournalEntry): void {
    this.db
      .prepare(
        `INSERT INTO journal (id, symbol, date, action, price, quantity, pnl, notes, emotions, lessons)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entry.id,
        entry.symbol,
        entry.date,
        entry.action,
        entry.price,
        entry.quantity,
        entry.pnl ?? null,
        entry.notes ?? null,
        entry.emotions ?? null,
        entry.lessons ?? null
      );
  }

  getJournalEntries(symbol?: string): JournalEntry[] {
    if (symbol) {
      return this.db
        .prepare("SELECT * FROM journal WHERE symbol = ? ORDER BY date DESC")
        .all(symbol) as JournalEntry[];
    }
    return this.db
      .prepare("SELECT * FROM journal ORDER BY date DESC")
      .all() as JournalEntry[];
  }

  deleteJournalEntry(id: string): boolean {
    const result = this.db.prepare("DELETE FROM journal WHERE id = ?").run(id);
    return result.changes > 0;
  }

  saveScreener(screener: {
    id: string;
    name: string;
    description?: string;
    criteria: object;
    createdAt: string;
    updatedAt: string;
  }): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO screeners (id, name, description, criteria, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        screener.id,
        screener.name,
        screener.description ?? null,
        JSON.stringify(screener.criteria),
        screener.createdAt,
        screener.updatedAt
      );
  }

  getScreeners(): { id: string; name: string; description: string | null; criteria: object }[] {
    return this.db
      .prepare("SELECT id, name, description, criteria FROM screeners ORDER BY name")
      .all()
      .map((row: any) => ({
        ...row,
        criteria: JSON.parse(row.criteria),
      }));
  }

  close(): void {
    this.db.close();
  }
}
