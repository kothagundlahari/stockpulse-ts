import { describe, expect, it } from "vitest";
import { NIFTY50, PERSONALITIES } from "../src/data/nifty50.js";
import type { Fundamentals } from "../src/types/index.js";

function getPersonality(id: string) {
  const personality = PERSONALITIES.find((p) => p.id === id);
  if (!personality) {
    throw new Error(`Missing personality: ${id}`);
  }
  return personality;
}

describe("NIFTY50 universe", () => {
  it("has a meaningful universe of unique stocks", () => {
    const symbols = new Set(NIFTY50.map((s) => s.symbol));
    expect(symbols.size).toBeGreaterThanOrEqual(45);
    expect(NIFTY50.length).toBe(symbols.size);
  });

  it("every stock has valid fundamentals", () => {
    for (const s of NIFTY50) {
      expect(s.marketCap).toBeGreaterThan(0);
      expect(s.sector).toBeTruthy();
    }
  });
});

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
    const graham = getPersonality("graham");
    const matched = NIFTY50.filter(graham.filter);
    // ONGC (PE 8, PB 1.2, dividend 4.5) should qualify
    expect(matched.some((s) => s.symbol === "ONGC")).toBe(true);
    // Reliance (PE 25, PB 2.8) should NOT qualify as deep value
    expect(matched.some((s) => s.symbol === "RELIANCE")).toBe(false);
  });

  it("Buffett's quality filter picks high-ROE, low-debt compounders", () => {
    const buffett = getPersonality("buffett");
    const matched = NIFTY50.filter(buffett.filter);
    // TCS (ROE 48, D/E 0.08, margin 25) should qualify
    expect(matched.some((s) => s.symbol === "TCS")).toBe(true);
    // Banks (high D/E) should generally NOT qualify under Buffett's low-debt rule
    expect(matched.some((s) => s.symbol === "HDFCBANK")).toBe(false);
  });

  it("dividend filter selects high-yield, reasonable-value names", () => {
    const div = getPersonality("dividend");
    const matched = NIFTY50.filter(div.filter);
    // COALINDIA (yield 5.5, PE 8, ROE 35) qualifies
    expect(matched.some((s) => s.symbol === "COALINDIA")).toBe(true);
    // ASIANPAINT (yield 0.9) does not
    expect(matched.some((s) => s.symbol === "ASIANPAINT")).toBe(false);
  });

  it("every personality returns a non-trivial subset of the universe", () => {
    for (const p of PERSONALITIES) {
      const count = NIFTY50.filter(p.filter).length;
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThan(NIFTY50.length);
    }
  });

  it("flagging a stock with missing fields does not crash a filter", () => {
    const incomplete: Fundamentals = { symbol: "X", marketCap: 1000 };
    for (const p of PERSONALITIES) {
      expect(() => p.filter(incomplete)).not.toThrow();
    }
  });
});
