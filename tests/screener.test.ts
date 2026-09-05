import { describe, expect, it } from "vitest";
import { Screener, screener } from "../src/engines/screener.js";
import type { Fundamentals } from "../src/types/index.js";

const mockUniverse: Fundamentals[] = [
  {
    symbol: "RELIANCE",
    marketCap: 1500000,
    peRatio: 25,
    pbRatio: 3.5,
    dividendYield: 0.5,
    roe: 15,
    debtToEquity: 0.3,
    revenueGrowth: 12,
  },
  {
    symbol: "TCS",
    marketCap: 800000,
    peRatio: 35,
    pbRatio: 12,
    dividendYield: 1.2,
    roe: 45,
    debtToEquity: 0.1,
    revenueGrowth: 8,
  },
  {
    symbol: "HDFCBANK",
    marketCap: 1200000,
    peRatio: 20,
    pbRatio: 3,
    dividendYield: 0.8,
    roe: 18,
    debtToEquity: 0.5,
    revenueGrowth: 15,
  },
  {
    symbol: "INFY",
    marketCap: 600000,
    peRatio: 28,
    pbRatio: 8,
    dividendYield: 2,
    roe: 32,
    debtToEquity: 0.2,
    revenueGrowth: 10,
  },
];

describe("Screener", () => {
  it("returns the whole Universe when Criteria is empty", () => {
    const engine = new Screener();
    const results = engine.runCriteria(mockUniverse, {});
    expect(results).toHaveLength(4);
  });

  it("applies Criteria minMarketCap", () => {
    const engine = new Screener();
    const results = engine.runCriteria(mockUniverse, { minMarketCap: 1000000 });
    expect(results).toHaveLength(2);
    expect(results.map((member) => member.symbol)).toEqual(["RELIANCE", "HDFCBANK"]);
  });

  it("applies Criteria maxMarketCap", () => {
    const engine = new Screener();
    const results = engine.runCriteria(mockUniverse, { maxMarketCap: 900000 });
    expect(results).toHaveLength(2);
    expect(results.map((member) => member.symbol)).toEqual(["TCS", "INFY"]);
  });

  it("applies Criteria PE range", () => {
    const engine = new Screener();
    const results = engine.runCriteria(mockUniverse, { minPe: 20, maxPe: 30 });
    expect(results).toHaveLength(3);
    expect(results.map((member) => member.symbol)).toEqual(["RELIANCE", "HDFCBANK", "INFY"]);
  });

  it("applies Criteria minDividendYield", () => {
    const engine = new Screener();
    const results = engine.runCriteria(mockUniverse, { minDividendYield: 1 });
    expect(results).toHaveLength(2);
    expect(results.map((member) => member.symbol)).toEqual(["TCS", "INFY"]);
  });

  it("applies Criteria minRoe", () => {
    const engine = new Screener();
    const results = engine.runCriteria(mockUniverse, { minRoe: 20 });
    expect(results).toHaveLength(2);
    expect(results.map((member) => member.symbol)).toEqual(["TCS", "INFY"]);
  });

  it("applies Criteria minRevenueGrowth", () => {
    const engine = new Screener();
    const results = engine.runCriteria(mockUniverse, { minRevenueGrowth: 11 });
    expect(results).toHaveLength(2);
    expect(results.map((member) => member.symbol)).toEqual(["RELIANCE", "HDFCBANK"]);
  });

  it("applies Criteria maxDebtToEquity", () => {
    const engine = new Screener();
    const results = engine.runCriteria(mockUniverse, { maxDebtToEquity: 0.3 });
    expect(results).toHaveLength(3);
    expect(results.map((member) => member.symbol)).toEqual(["RELIANCE", "TCS", "INFY"]);
  });

  it("applies combined Criteria", () => {
    const engine = new Screener();
    const results = engine.runCriteria(mockUniverse, {
      minMarketCap: 800000,
      maxPe: 30,
      minRoe: 15,
    });
    expect(results).toHaveLength(2);
    expect(results.map((member) => member.symbol)).toEqual(["RELIANCE", "HDFCBANK"]);
  });

  it("returns an empty array when no Universe members match", () => {
    const engine = new Screener();
    const results = engine.runCriteria(mockUniverse, { minMarketCap: 9999999 });
    expect(results).toHaveLength(0);
  });

  it("handles undefined optional fields gracefully", () => {
    const membersWithMissing: Fundamentals[] = [
      { symbol: "TEST1", marketCap: 100000, peRatio: undefined },
      { symbol: "TEST2", marketCap: 200000, peRatio: 15 },
    ];
    const engine = new Screener();
    const results = engine.runCriteria(membersWithMissing, { maxPe: 20 });
    expect(results).toHaveLength(1);
    expect(results[0]?.symbol).toBe("TEST2");
  });
});

describe("Unified Screener module", () => {
  it("provides personality metadata via getPersonalities", () => {
    const engine = new Screener();
    const personalities = engine.getPersonalities();
    expect(personalities.length).toBeGreaterThanOrEqual(8);
    const buffett = personalities.find((p) => p.id === "buffett");
    expect(buffett).toBeDefined();
    expect(buffett?.name).toBe("Warren Buffett");
  });

  it("retrieves personality definition by id", () => {
    expect(screener.getPersonality("buffett")).toBeDefined();
    expect(screener.getPersonality("non-existent")).toBeUndefined();
  });

  it("runs criteria screening via runCriteria", () => {
    const matched = screener.runCriteria(mockUniverse, { minRoe: 20 });
    expect(matched).toHaveLength(2);
    expect(matched.map((member) => member.symbol)).toEqual(["TCS", "INFY"]);
  });

  it("runs a Personality run returning Candidates ranked by score descending", () => {
    const universe: Fundamentals[] = [
      {
        symbol: "A",
        sector: "IT",
        roe: 25,
        debtToEquity: 0.1,
        operatingMargin: 20,
        peRatio: 18,
      },
      {
        symbol: "B",
        sector: "IT",
        roe: 30,
        debtToEquity: 0.2,
        operatingMargin: 25,
        peRatio: 22,
      },
    ];
    const ranked = screener.runPersonality(universe, "buffett");
    expect(ranked).toHaveLength(2);
    expect(ranked[0]?.score).toBeGreaterThanOrEqual(ranked[1]?.score ?? 0);
  });

  it("throws for unknown personality in runPersonality", () => {
    expect(() => screener.runPersonality([], "unknown-philosophy")).toThrow(/Unknown personality/);
  });

  it("summarizes all personality runs via runAllPersonalities", () => {
    const summary = screener.runAllPersonalities(mockUniverse);
    expect(summary.total).toBe(mockUniverse.length);
    expect(summary.personalities.length).toBeGreaterThanOrEqual(8);
    for (const run of summary.personalities) {
      expect(run.matches).toBe(run.candidates.length);
      expect("stocks" in run).toBe(false);
    }
  });

  it("returns a personality detail run or undefined for unknown ids", () => {
    const detail = screener.runPersonalityDetail(mockUniverse, "buffett");
    expect(detail?.id).toBe("buffett");
    expect(detail?.total).toBe(mockUniverse.length);
    expect(Array.isArray(detail?.candidates)).toBe(true);
    expect("stocks" in (detail ?? {})).toBe(false);
    expect(screener.runPersonalityDetail(mockUniverse, "unknown-philosophy")).toBeUndefined();
  });
});
