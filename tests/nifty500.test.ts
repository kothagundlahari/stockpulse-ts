import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getNifty500Fundamentals,
  parseNifty500Csv,
  resetNifty500CacheForTesting,
} from "../src/data/nifty500.js";
import { DatabaseService } from "../src/services/database.js";
import type { YahooFinanceService } from "../src/services/yahoo-finance.js";

const CSV =
  "Symbol,Company Name,Industry\n" +
  "RELIANCE,Reliance Industries Ltd,Energy\n" +
  "TCS,Tata Consultancy Services,IT\n" +
  "HDFCBANK,HDFC Bank,Banking\n" +
  "INFY,Infosys,Technology\n";

describe("NIFTY 500 universe", () => {
  it("parses only the Symbol column from the NSE CSV", () => {
    expect(parseNifty500Csv(CSV)).toEqual(["RELIANCE", "TCS", "HDFCBANK", "INFY"]);
  });

  it("does not leak company names as symbols", () => {
    const symbols = parseNifty500Csv(CSV);
    expect(symbols).not.toContain("RELIANCE INDUSTRIES LTD");
    expect(symbols).not.toContain("TATA CONSULTANCY SERVICES");
  });

  it("drops empty and duplicate symbols", () => {
    const symbols = parseNifty500Csv(
      "Symbol,Company Name,Industry\nRELIANCE,a,1\nRELIANCE,b,2\nHDFCBANK,c,3\n",
    );
    expect(symbols).toEqual(["RELIANCE", "HDFCBANK"]);
  });

  it("handles headerless CSV by reading the first cell", () => {
    expect(parseNifty500Csv("RELIANCE,5\nTCS,99\n")).toEqual(["RELIANCE", "TCS"]);
  });
});

describe("getNifty500Fundamentals with SQLite cache", () => {
  const TEST_DB = "./data/test-nifty500-cache.db";

  const cleanup = () => {
    if (fs.existsSync(TEST_DB)) {
      fs.unlinkSync(TEST_DB);
    }
  };

  beforeEach(() => {
    cleanup();
    resetNifty500CacheForTesting();
  });

  afterEach(() => {
    cleanup();
    resetNifty500CacheForTesting();
  });

  it("returns fresh fundamentals from SQLite without querying Yahoo", async () => {
    const db = new DatabaseService(TEST_DB);
    const mockYahoo: Partial<YahooFinanceService> = {
      getFundamentals: vi.fn(),
    };

    // Pre-populate DB with 2 fresh records
    db.saveFundamentals(
      [
        { symbol: "RELIANCE", peRatio: 25 },
        { symbol: "TCS", peRatio: 30 },
      ],
      Date.now(),
    );

    const result = await getNifty500Fundamentals({
      store: db,
      market: mockYahoo as YahooFinanceService,
      listSymbols: async () => {
        throw new Error("listSymbols must not run on a cache hit");
      },
    });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.symbol).sort()).toEqual(["RELIANCE", "TCS"]);
    // Ensure Yahoo was NOT called
    expect(mockYahoo.getFundamentals).not.toHaveBeenCalled();

    db.close();
  });

  it("fetches and stores Fundamentals on a cache miss", async () => {
    const db = new DatabaseService(TEST_DB);
    const mockYahoo: Partial<YahooFinanceService> = {
      getFundamentals: vi.fn().mockResolvedValue({ symbol: "TCS", peRatio: 28 }),
    };

    const result = await getNifty500Fundamentals({
      store: db,
      market: mockYahoo as YahooFinanceService,
      listSymbols: async () => ["TCS"],
    });
    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe("TCS");
    expect(result[0].peRatio).toBe(28);
    expect(mockYahoo.getFundamentals).toHaveBeenCalledWith("TCS");
    expect(db.getCachedFundamentals("TCS")?.data.peRatio).toBe(28);

    db.close();
  });

  it("falls back to stale SQLite cache when Yahoo fails", async () => {
    const db = new DatabaseService(TEST_DB);
    const staleTime = Date.now() - 30 * 60 * 60 * 1000; // 30 hours old (> 24h)

    db.saveFundamentals([{ symbol: "INFY", peRatio: 22 }], staleTime);

    const mockYahoo: Partial<YahooFinanceService> = {
      getFundamentals: vi.fn().mockRejectedValue(new Error("Yahoo rate limit 429")),
    };

    try {
      const result = await getNifty500Fundamentals(
        {
          store: db,
          market: mockYahoo as YahooFinanceService,
          listSymbols: async () => ["INFY"],
        },
        { force: true },
      );
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe("INFY");
      expect(result[0].peRatio).toBe(22);
    } finally {
      db.close();
    }
  });

  it("returns a symbol-only Fundamentals row when Yahoo and the store both miss", async () => {
    const db = new DatabaseService(TEST_DB);
    const mockYahoo: Partial<YahooFinanceService> = {
      getFundamentals: vi.fn().mockRejectedValue(new Error("Yahoo down")),
    };

    try {
      const result = await getNifty500Fundamentals({
        store: db,
        market: mockYahoo as YahooFinanceService,
        listSymbols: async () => ["WIPRO"],
      });
      expect(result).toEqual([{ symbol: "WIPRO" }]);
    } finally {
      db.close();
    }
  });
});
