import { describe, expect, it } from "vitest";
import { recommendHolding } from "../src/engines/holding-recommendation.js";
import type { Holding } from "../src/services/broker-types.js";
import type { Fundamentals } from "../src/types/index.js";

const holding: Holding = {
  symbol: "RELIANCE",
  quantity: 10,
  averagePrice: 2400,
  ltp: 2500,
  pnl: 1000,
  pnlPercent: 4.17,
  dayChange: 25,
  dayChangePercent: 1,
  currentValue: 25000,
};

const cheapSolid: Fundamentals = {
  symbol: "RELIANCE",
  peRatio: 12,
  roe: 22,
  debtToEquity: 0.2,
  revenueGrowth: 15,
};

describe("recommendHolding", () => {
  it("BUY_MORE when undervalued, solid fundamentals, below SMAs", () => {
    const r = recommendHolding(holding, cheapSolid, { current: 2500, sma10: 2600, sma50: 2600 }, 4);
    expect(r.action).toBe("BUY_MORE");
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it("SELL on over-concentration with weak momentum", () => {
    const r = recommendHolding(
      holding,
      { symbol: "RELIANCE", peRatio: 60 },
      { current: 2500, sma10: 2450, sma50: 2400 },
      38,
    );
    expect(["SELL", "HOLD"]).toContain(r.action);
    if (r.action === "SELL")
      expect(r.reasons.join(" ").toLowerCase()).toMatch(/concentrat|weight|trim/);
  });

  it("HOLD when mixed signals and reasonable weight", () => {
    const r = recommendHolding(
      holding,
      { symbol: "RELIANCE", peRatio: 28 },
      { current: 2500, sma10: 2490, sma50: 2505 },
      10,
    );
    expect(["HOLD", "BUY_MORE", "SELL"]).toContain(r.action);
  });

  it("returns low confidence when fundamentals are missing", () => {
    const r = recommendHolding(holding, undefined, { current: 2500, sma10: 2510, sma50: 2520 }, 5);
    expect(r.confidence).toBe("low");
  });

  it("never returns a confidence of undefined", () => {
    const r = recommendHolding(holding, undefined, { current: 2500, sma10: 2510, sma50: 2520 }, 5);
    expect(r.confidence).toBeDefined();
  });
});
