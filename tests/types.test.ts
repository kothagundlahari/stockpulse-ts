import { describe, expect, it } from "vitest";
import {
  BacktestConfigSchema,
  CriteriaSchema,
  QuoteSchema,
  StockSchema,
} from "../src/types/index.js";

describe("Stock", () => {
  it("validates a correct stock", () => {
    const result = StockSchema.safeParse({
      symbol: "RELIANCE",
      name: "Reliance Industries",
      exchange: "NSE",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty symbol", () => {
    const result = StockSchema.safeParse({
      symbol: "",
      name: "Reliance Industries",
      exchange: "NSE",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid exchange", () => {
    const result = StockSchema.safeParse({
      symbol: "RELIANCE",
      name: "Reliance Industries",
      exchange: "NYSE",
    });
    expect(result.success).toBe(false);
  });
});

describe("Quote", () => {
  it("validates a correct quote", () => {
    const result = QuoteSchema.safeParse({
      symbol: "RELIANCE",
      ltp: 2500,
      change: 50,
      changePercent: 2,
      open: 2480,
      high: 2520,
      low: 2460,
      previousClose: 2450,
      volume: 1000000,
      timestamp: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative ltp", () => {
    const result = QuoteSchema.safeParse({
      symbol: "RELIANCE",
      ltp: -100,
      change: 50,
      changePercent: 2,
      open: 2480,
      high: 2520,
      low: 2460,
      previousClose: 2450,
      volume: 1000000,
      timestamp: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});

describe("Criteria", () => {
  it("validates empty criteria", () => {
    const result = CriteriaSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("validates min market cap", () => {
    const result = CriteriaSchema.safeParse({
      minMarketCap: 10000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid min pe", () => {
    const result = CriteriaSchema.safeParse({
      minPe: "not a number",
    });
    expect(result.success).toBe(false);
  });
});

describe("BacktestConfig", () => {
  it("validates a correct config", () => {
    const result = BacktestConfigSchema.safeParse({
      symbol: "RELIANCE",
      startDate: "2024-01-01T00:00:00Z",
      endDate: "2024-12-31T00:00:00Z",
      initialCapital: 100000,
      strategy: "sma_crossover",
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative capital", () => {
    const result = BacktestConfigSchema.safeParse({
      symbol: "RELIANCE",
      startDate: "2024-01-01T00:00:00Z",
      endDate: "2024-12-31T00:00:00Z",
      initialCapital: -100000,
      strategy: "sma_crossover",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid strategy", () => {
    const result = BacktestConfigSchema.safeParse({
      symbol: "RELIANCE",
      startDate: "2024-01-01T00:00:00Z",
      endDate: "2024-12-31T00:00:00Z",
      initialCapital: 100000,
      strategy: "invalid",
    });
    expect(result.success).toBe(false);
  });
});
