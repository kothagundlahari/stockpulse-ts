import { describe, it, expect } from "vitest";
import { BacktestEngine } from "../src/engines/backtest.js";

describe("BacktestEngine", () => {
  const dailyPrices = [
    { date: "2024-01-01", open: 100, close: 102, high: 105, low: 99, volume: 1000 },
    { date: "2024-01-02", open: 102, close: 104, high: 106, low: 101, volume: 1200 },
    { date: "2024-01-03", open: 104, close: 103, high: 107, low: 102, volume: 1100 },
    { date: "2024-01-04", open: 103, close: 108, high: 110, low: 102, volume: 1500 },
    { date: "2024-01-05", open: 108, close: 110, high: 112, low: 107, volume: 1800 },
    { date: "2024-01-06", open: 110, close: 109, high: 113, low: 108, volume: 1400 },
    { date: "2024-01-07", open: 109, close: 112, high: 114, low: 108, volume: 2000 },
    { date: "2024-01-08", open: 112, close: 115, high: 117, low: 111, volume: 2200 },
    { date: "2024-01-09", open: 115, close: 113, high: 118, low: 112, volume: 1900 },
    { date: "2024-01-10", open: 113, close: 118, high: 120, low: 112, volume: 2500 },
  ];

  it("calculates simple buy-and-hold return", () => {
    const engine = new BacktestEngine();
    const result = engine.run(
      dailyPrices,
      100000,
      (prices, idx) => (idx === 0 ? "BUY" : "HOLD")
    );
    expect(result.initialCapital).toBe(100000);
    expect(result.finalCapital).toBeGreaterThan(100000);
    expect(result.trades.length).toBe(1);
  });

  it("executes SMA crossover strategy", () => {
    const engine = new BacktestEngine();
    const smaCrossover = (
      prices: { close: number }[],
      idx: number
    ): "BUY" | "SELL" | "HOLD" => {
      if (idx < 4) return "HOLD";
      const shortSma =
        (prices[idx].close + prices[idx - 1].close + prices[idx - 2].close) / 3;
      const longSma =
        (prices[idx].close +
          prices[idx - 1].close +
          prices[idx - 2].close +
          prices[idx - 3].close +
          prices[idx - 4].close) /
        5;
      if (shortSma > longSma && idx > 0) return "BUY";
      if (shortSma < longSma) return "SELL";
      return "HOLD";
    };
    const result = engine.run(dailyPrices, 100000, smaCrossover);
    expect(result.trades.length).toBeGreaterThanOrEqual(1);
    expect(result.equityCurve.length).toBe(dailyPrices.length);
  });

  it("tracks equity curve correctly", () => {
    const engine = new BacktestEngine();
    const result = engine.run(
      dailyPrices,
      100000,
      (prices, idx) => (idx === 0 ? "BUY" : idx === 5 ? "SELL" : "HOLD")
    );
    expect(result.equityCurve.length).toBe(dailyPrices.length);
    expect(result.equityCurve[0].value).toBe(100000);
  });

  it("calculates win rate", () => {
    const engine = new BacktestEngine();
    const result = engine.run(
      dailyPrices,
      100000,
      (prices, idx) => {
        if (idx === 0) return "BUY";
        if (idx === 2) return "SELL";
        if (idx === 5) return "BUY";
        if (idx === 8) return "SELL";
        return "HOLD";
      }
    );
    expect(result.winRate).toBeGreaterThanOrEqual(0);
    expect(result.winRate).toBeLessThanOrEqual(100);
  });

  it("returns zero trades with hold-only strategy", () => {
    const engine = new BacktestEngine();
    const result = engine.run(dailyPrices, 100000, () => "HOLD");
    expect(result.trades.length).toBe(0);
    expect(result.winRate).toBe(0);
  });
});
