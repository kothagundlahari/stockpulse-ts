import { describe, expect, it } from "vitest";
import { PERSONALITIES } from "../src/data/nifty50.js";
import type { Fundamentals } from "../src/types/index.js";

function getPersonality(id: string) {
  const personality = PERSONALITIES.find((p) => p.id === id);
  if (!personality) throw new Error(`Missing personality: ${id}`);
  return personality;
}

const FIXTURE: Fundamentals[] = [
  {
    symbol: "ONGC",
    peRatio: 8,
    pbRatio: 1.2,
    dividendYield: 4.5,
    roe: 18,
    debtToEquity: 0.4,
    operatingMargin: 25,
  },
  {
    symbol: "RELIANCE",
    peRatio: 25,
    pbRatio: 2.8,
    dividendYield: 0.3,
    roe: 9.6,
    debtToEquity: 0.6,
    operatingMargin: 14,
  },
  {
    symbol: "TCS",
    peRatio: 28,
    pbRatio: 10.5,
    dividendYield: 1.3,
    roe: 48,
    debtToEquity: 0.08,
    operatingMargin: 25,
    revenueGrowth: 10,
  },
  {
    symbol: "COALINDIA",
    peRatio: 8,
    pbRatio: 1.1,
    dividendYield: 5.5,
    roe: 35,
    debtToEquity: 0.3,
    operatingMargin: 20,
  },
  {
    symbol: "HDFCBANK",
    peRatio: 19,
    pbRatio: 3.1,
    dividendYield: 1.0,
    roe: 16.8,
    debtToEquity: 5.2,
    operatingMargin: 58,
  },
  { symbol: "GROWTH", peRatio: 30, roe: 25, revenueGrowth: 20, operatingMargin: 20 },
  {
    symbol: "ASIANPAINT",
    peRatio: 50,
    pbRatio: 16,
    dividendYield: 0.9,
    roe: 28,
  },
  { symbol: "LYCHCASE", peRatio: 20, revenueGrowth: 15, netProfit: 500 },
];

describe("Personality screeners", () => {
  it("defines all eight personalities", () => {
    expect(PERSONALITIES).toHaveLength(8);
    const ids = PERSONALITIES.map((p) => p.id);
    expect(ids).toContain("buffett");
    expect(ids).toContain("munger");
    expect(ids).toContain("lych");
    expect(ids).toContain("graham");
    expect(ids).toContain("greenblatt");
    expect(ids).toContain("klarman");
    expect(ids).toContain("dividend");
    expect(ids).toContain("momentum");
  });

  it("Graham's deep-value filter favors low P/E, low P/B, dividend payers", () => {
    const matched = FIXTURE.filter(getPersonality("graham").filter);
    expect(matched.some((s) => s.symbol === "ONGC")).toBe(true);
    expect(matched.some((s) => s.symbol === "RELIANCE")).toBe(false);
  });

  it("Buffett's quality filter picks high-ROE, low-debt compounders", () => {
    const matched = FIXTURE.filter(getPersonality("buffett").filter);
    expect(matched.some((s) => s.symbol === "TCS")).toBe(true);
    expect(matched.some((s) => s.symbol === "HDFCBANK")).toBe(false);
  });

  it("dividend filter selects high-yield, reasonable-value names", () => {
    const matched = FIXTURE.filter(getPersonality("dividend").filter);
    expect(matched.some((s) => s.symbol === "COALINDIA")).toBe(true);
    expect(matched.some((s) => s.symbol === "ASIANPAINT")).toBe(false);
  });

  it("every personality returns a non-trivial subset of a realistic universe", () => {
    for (const p of PERSONALITIES) {
      const count = FIXTURE.filter(p.filter).length;
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(FIXTURE.length);
    }
  });

  it("flagging a stock with missing fields does not crash a filter", () => {
    const incomplete: Fundamentals = { symbol: "X", marketCap: 1000 };
    for (const p of PERSONALITIES) {
      expect(() => p.filter(incomplete)).not.toThrow();
    }
  });
});
