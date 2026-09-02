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

  it("deletes journal entries", () => {
    db.addJournalEntry({
      id: "1",
      symbol: "RELIANCE",
      date: "2024-01-01T00:00:00Z",
      action: "BUY",
      price: 2500,
      quantity: 10,
    });

    const deleted = db.deleteJournalEntry("1");
    expect(deleted).toBe(true);
    expect(db.getJournalEntries()).toHaveLength(0);
  });

  it("saves and retrieves screeners", () => {
    db.saveScreener({
      id: "test-1",
      name: "Value Screener",
      criteria: { minMarketCap: 100000 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const screeners = db.getScreeners();
    expect(screeners).toHaveLength(1);
    expect(screeners[0].name).toBe("Value Screener");
    expect(screeners[0].criteria).toEqual({ minMarketCap: 100000 });
  });
});
