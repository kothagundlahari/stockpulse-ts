import fs from "node:fs";
import path from "node:path";
import SqliteDb from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseService } from "../src/services/database.js";

const JOURNAL_REMOVAL_DB = "./data/test-journal-removal.db";

describe("journal removal migration", () => {
  const cleanup = () => {
    for (const suffix of ["", "-wal", "-shm"]) {
      const path = `${JOURNAL_REMOVAL_DB}${suffix}`;
      if (fs.existsSync(path)) {
        fs.unlinkSync(path);
      }
    }
  };

  beforeEach(cleanup);
  afterEach(cleanup);

  it("drops the legacy journal table during migration", () => {
    fs.mkdirSync(path.dirname(JOURNAL_REMOVAL_DB), { recursive: true });
    const legacyDb = new SqliteDb(JOURNAL_REMOVAL_DB);
    legacyDb.exec("CREATE TABLE journal (id TEXT PRIMARY KEY, notes TEXT)");
    legacyDb.prepare("INSERT INTO journal (id, notes) VALUES (?, ?)").run("1", "legacy");
    legacyDb.close();

    const db = new DatabaseService(JOURNAL_REMOVAL_DB);
    const migratedDb = new SqliteDb(JOURNAL_REMOVAL_DB);
    const journalTable = migratedDb
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'journal'")
      .get();
    migratedDb.close();
    db.close();

    expect(journalTable).toBeUndefined();
  });
});

describe("broker tokens", () => {
  const DB_PATH_1 = "./data/test-broker-token.db";
  const DB_PATH_2 = "./data/test-broker-token-2.db";

  const cleanup = () => {
    for (const p of [DB_PATH_1, DB_PATH_2]) {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    }
  };

  beforeEach(cleanup);
  afterEach(cleanup);

  it("stores and retrieves an Upstox access token", () => {
    const db = new DatabaseService(DB_PATH_1);
    db.setBrokerToken("upstox", "tok-abc");
    expect(db.getBrokerToken("upstox")).toBe("tok-abc");
    db.close();
  });

  it("updates an existing broker token", () => {
    const db = new DatabaseService(DB_PATH_1);
    db.setBrokerToken("upstox", "tok-abc");
    db.setBrokerToken("upstox", "tok-def");
    expect(db.getBrokerToken("upstox")).toBe("tok-def");
    db.close();
  });

  it("returns null for an unknown broker", () => {
    const db = new DatabaseService(DB_PATH_2);
    expect(db.getBrokerToken("nope")).toBeNull();
    db.close();
  });

  it("deletes a stored broker token", () => {
    const db = new DatabaseService(DB_PATH_1);
    db.setBrokerToken("upstox", "tok-xyz");
    expect(db.getBrokerToken("upstox")).toBe("tok-xyz");
    db.deleteBrokerToken("upstox");
    expect(db.getBrokerToken("upstox")).toBeNull();
    db.close();
  });
});

describe("fundamentals cache", () => {
  const DB_PATH = "./data/test-fundamentals-cache.db";

  const cleanup = () => {
    if (fs.existsSync(DB_PATH)) {
      fs.unlinkSync(DB_PATH);
    }
  };

  beforeEach(cleanup);
  afterEach(cleanup);

  it("stores, retrieves, and updates cached fundamentals", () => {
    const db = new DatabaseService(DB_PATH);
    expect(db.getCachedFundamentals("RELIANCE")).toBeNull();
    expect(db.getAllCachedFundamentals()).toHaveLength(0);

    const now = 1700000000000;
    db.saveFundamentals(
      [
        { symbol: "RELIANCE", peRatio: 25.4, marketCap: 1800000, roe: 14.5 },
        { symbol: "TCS", peRatio: 29.1, marketCap: 1400000, roe: 38.2 },
      ],
      now,
    );

    const reliance = db.getCachedFundamentals("RELIANCE");
    expect(reliance).not.toBeNull();
    expect(reliance?.data.symbol).toBe("RELIANCE");
    expect(reliance?.data.peRatio).toBe(25.4);
    expect(reliance?.updatedAt).toBe(now);

    const all = db.getAllCachedFundamentals();
    expect(all).toHaveLength(2);
    expect(all.map((item) => item.data.symbol).sort()).toEqual(["RELIANCE", "TCS"]);

    // Test upsert / update
    const later = now + 10000;
    db.saveFundamentals(
      [{ symbol: "RELIANCE", peRatio: 26.0, marketCap: 1850000, roe: 15.0 }],
      later,
    );

    const updatedReliance = db.getCachedFundamentals("RELIANCE");
    expect(updatedReliance?.data.peRatio).toBe(26.0);
    expect(updatedReliance?.updatedAt).toBe(later);
    expect(db.getAllCachedFundamentals()).toHaveLength(2);

    // Test clear
    db.clearFundamentalsCache();
    expect(db.getAllCachedFundamentals()).toHaveLength(0);
    expect(db.getCachedFundamentals("RELIANCE")).toBeNull();

    db.close();
  });

  it("handles cache freshness and custom TTL policies via getFreshFundamentals", () => {
    const db = new DatabaseService(DB_PATH);
    expect(db.getFreshFundamentals("INFY")).toBeNull();

    const now = Date.now();
    db.saveFundamentals(
      [
        { symbol: "INFY", peRatio: 22.0, marketCap: 600000, roe: 28.0 },
        { symbol: "WIPRO", peRatio: 18.5, marketCap: 250000, roe: 16.0 },
      ],
      now - 2 * 60 * 60 * 1000, // 2 hours ago
    );

    // Fresh within default 24h TTL
    const infy = db.getFreshFundamentals("INFY");
    expect(infy).not.toBeNull();
    expect(infy?.symbol).toBe("INFY");
    expect(infy?.peRatio).toBe(22.0);

    // Expired with custom maxAge of 1 hour
    const expiredCustom = db.getFreshFundamentals("INFY", 60 * 60 * 1000);
    expect(expiredCustom).toBeNull();

    // Fresh with custom maxAge of 3 hours
    const freshCustom = db.getFreshFundamentals("INFY", 3 * 60 * 60 * 1000);
    expect(freshCustom).not.toBeNull();
    expect(freshCustom?.symbol).toBe("INFY");

    // Stored 25 hours ago -> expired under default 24h TTL
    db.saveFundamentals(
      [{ symbol: "WIPRO", peRatio: 18.5, marketCap: 250000, roe: 16.0 }],
      now - 25 * 60 * 60 * 1000,
    );
    expect(db.getFreshFundamentals("WIPRO")).toBeNull();

    db.close();
  });

  it("returns the full Universe snapshot only when every row is fresh", () => {
    const db = new DatabaseService(DB_PATH);
    const now = Date.now();
    db.saveFundamentals(
      [
        { symbol: "INFY", peRatio: 22 },
        { symbol: "TCS", peRatio: 28 },
      ],
      now,
    );
    expect(
      db
        .getAllFreshFundamentals()
        .map((row) => row.symbol)
        .sort(),
    ).toEqual(["INFY", "TCS"]);

    db.saveFundamentals([{ symbol: "TCS", peRatio: 28 }], now - 25 * 60 * 60 * 1000);
    expect(db.getAllFreshFundamentals()).toEqual([]);

    db.close();
  });
});

describe("database file permissions", () => {
  const DB_PATH = "./data/test-perms.db";

  const cleanup = () => {
    for (const suffix of ["", "-wal", "-shm"]) {
      const p = `${DB_PATH}${suffix}`;
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    }
  };

  beforeEach(cleanup);
  afterEach(cleanup);

  it("creates the database file with 0600 permissions", () => {
    const db = new DatabaseService(DB_PATH);
    db.close();
    const mode = fs.statSync(DB_PATH).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
