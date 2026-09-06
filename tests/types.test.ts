import { describe, expect, it } from "vitest";
import {
  CriteriaSchema,
  HoldingSchema,
  OrderRequestSchema,
  parseOrderRequest,
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

  it("allows a Quote without previousClose", () => {
    const result = QuoteSchema.safeParse({
      symbol: "RELIANCE",
      ltp: 2500,
      change: 0,
      changePercent: 0,
      open: 2480,
      high: 2520,
      low: 2460,
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

describe("Holding", () => {
  const valid = {
    symbol: "RELIANCE",
    quantity: 10,
    averagePrice: 2400,
    ltp: 2500,
    pnl: 1000,
    pnlPercent: 4.17,
    dayChange: 25,
    dayChangePercent: 1.0,
    currentValue: 25000,
  };

  it("validates a correct Holding", () => {
    expect(HoldingSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an empty symbol", () => {
    expect(HoldingSchema.safeParse({ ...valid, symbol: "" }).success).toBe(false);
  });
});

describe("Order request", () => {
  const valid = {
    symbol: "TCS",
    qty: 5,
    side: "BUY" as const,
    type: "MARKET" as const,
    confirm: true as const,
  };

  it("validates a confirmed MARKET Order request", () => {
    expect(OrderRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("validates a confirmed LIMIT Order request", () => {
    expect(
      OrderRequestSchema.safeParse({ ...valid, type: "LIMIT", limitPrice: 3800 }).success,
    ).toBe(true);
  });

  it("rejects confirm that is not true", () => {
    expect(OrderRequestSchema.safeParse({ ...valid, confirm: false }).success).toBe(false);
  });

  it("rejects an empty symbol", () => {
    expect(OrderRequestSchema.safeParse({ ...valid, symbol: "" }).success).toBe(false);
  });

  it("rejects an invalid side", () => {
    expect(OrderRequestSchema.safeParse({ ...valid, side: "HOLD" }).success).toBe(false);
  });

  it("rejects a LIMIT Order request without a positive limit price", () => {
    expect(OrderRequestSchema.safeParse({ ...valid, type: "LIMIT" }).success).toBe(false);
  });
});

describe("parseOrderRequest", () => {
  const valid = {
    symbol: "TCS",
    qty: 5,
    side: "BUY" as const,
    type: "MARKET" as const,
    confirm: true as const,
  };

  it("returns a confirmed MARKET Order request", () => {
    const parsed = parseOrderRequest(valid);
    expect(parsed).toEqual({ ok: true, value: valid });
  });

  it("rejects a body that is not confirm:true", () => {
    expect(parseOrderRequest({ ...valid, confirm: false })).toEqual({
      ok: false,
      error: "Order not confirmed. Set confirm:true to place a real order.",
    });
    expect(parseOrderRequest(null)).toEqual({
      ok: false,
      error: "Order not confirmed. Set confirm:true to place a real order.",
    });
  });

  it("uses one rule for empty and path-like symbols", () => {
    expect(parseOrderRequest({ ...valid, symbol: "" })).toEqual({
      ok: false,
      error: "Missing or invalid symbol.",
    });
    expect(parseOrderRequest({ ...valid, symbol: "../../etc" })).toEqual({
      ok: false,
      error: "Missing or invalid symbol.",
    });
  });

  it("rejects an invalid side with the HTTP message", () => {
    expect(parseOrderRequest({ ...valid, side: "HOLD" })).toEqual({
      ok: false,
      error: "Invalid side. Must be BUY or SELL.",
    });
  });

  it("rejects an invalid type with the HTTP message", () => {
    expect(parseOrderRequest({ ...valid, type: "STOP" })).toEqual({
      ok: false,
      error: "Invalid type. Must be LIMIT or MARKET.",
    });
  });

  it("rejects a non-positive qty with the HTTP message", () => {
    expect(parseOrderRequest({ ...valid, qty: -2 })).toEqual({
      ok: false,
      error: "Invalid qty. Must be a positive integer.",
    });
  });

  it("rejects LIMIT without a positive limitPrice with the HTTP message", () => {
    expect(parseOrderRequest({ ...valid, type: "LIMIT" })).toEqual({
      ok: false,
      error: "limitPrice must be a positive number for LIMIT orders.",
    });
  });

  it("does not require limitPrice on a MARKET Order request", () => {
    expect(parseOrderRequest({ ...valid, limitPrice: -50 })).toEqual({
      ok: true,
      value: { ...valid, limitPrice: -50 },
    });
  });
});
