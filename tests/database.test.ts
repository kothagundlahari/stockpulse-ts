import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseService } from "../src/services/database.js";

const TEST_DB = "./data/test-stockpulse.db";

describe("DatabaseService", () => {
  let db: DatabaseService;

  beforeEach(() => {
    if (fs.existsSync(TEST_DB)) {
      fs.unlinkSync(TEST_DB);
    }
    db = new DatabaseService(TEST_DB);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) {
      fs.unlinkSync(TEST_DB);
    }
  });

  it("adds and retrieves journal entries", () => {
    db.addJournalEntry({
      id: "1",
      symbol: "RELIANCE",
      date: "2024-01-01T00:00:00Z",
      action: "BUY",
      price: 2500,
      quantity: 10,
      notes: "Test buy",
    });

    const entries = db.getJournalEntries("RELIANCE");
    expect(entries).toHaveLength(1);
    expect(entries[0].symbol).toBe("RELIANCE");
    expect(entries[0].price).toBe(2500);
  });

  it("returns all entries when no symbol specified", () => {
    db.addJournalEntry({
      id: "1",
      symbol: "RELIANCE",
      date: "2024-01-01T00:00:00Z",
      action: "BUY",
      price: 2500,
      quantity: 10,
    });
    db.addJournalEntry({
      id: "2",
      symbol: "TCS",
      date: "2024-01-02T00:00:00Z",
      action: "BUY",
      price: 3500,
      quantity: 5,
    });

    const entries = db.getJournalEntries();
    expect(entries).toHaveLength(2);
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
});
