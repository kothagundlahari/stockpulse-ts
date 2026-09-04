import { describe, expect, it } from "vitest";
import { PERSONALITIES } from "../src/data/nifty50.js";
import {
  calculatePersonalityScore,
  computeSectorMedians,
  rankPersonalityCandidates,
} from "../src/engines/personality-ranker.js";
import type { Fundamentals } from "../src/types/index.js";

const FIXTURE_UNIVERSE: Fundamentals[] = [
  {
    symbol: "TECH1",
    sector: "Technology",
    peRatio: 20,
    pbRatio: 4,
    dividendYield: 1.5,
    roe: 30,
    debtToEquity: 0.1,
    operatingMargin: 25,
    revenueGrowth: 15,
  },
  {
    symbol: "TECH2",
    sector: "Technology",
    peRatio: 28,
    pbRatio: 6,
    dividendYield: 0.8,
    roe: 20,
    debtToEquity: 0.2,
    operatingMargin: 21,
    revenueGrowth: 12,
  },
  {
    symbol: "RETAIL1",
    sector: "Consumer",
    peRatio: 12,
    pbRatio: 1.4,
    dividendYield: 2.0,
    roe: 18,
    debtToEquity: 0.3,
    operatingMargin: 8,
    revenueGrowth: 14,
  },
  {
    symbol: "RETAIL2",
    sector: "Consumer",
    peRatio: 14,
    pbRatio: 1.2,
    dividendYield: 2.5,
    roe: 14,
    debtToEquity: 0.4,
    operatingMargin: 6,
    revenueGrowth: 8,
  },
];

describe("PersonalityRanker", () => {
  it("computes sector medians accurately", () => {
    const medians = computeSectorMedians(FIXTURE_UNIVERSE);
    const tech = medians.get("Technology");
    const retail = medians.get("Consumer");

    expect(tech).toBeDefined();
    expect(tech?.medianOperatingMargin).toBe(23); // (25 + 21) / 2
    expect(tech?.medianRoe).toBe(25); // (30 + 20) / 2

    expect(retail).toBeDefined();
    expect(retail?.medianOperatingMargin).toBe(7); // (8 + 6) / 2
    expect(retail?.medianRoe).toBe(16); // (18 + 14) / 2
  });

  it("calculates sector-adjusted score between 0 and 100", () => {
    const benchmark = { medianOperatingMargin: 7, medianRoe: 16 };
    const stock = FIXTURE_UNIVERSE[2]; // RETAIL1
    const score = calculatePersonalityScore("buffett", stock, benchmark);

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("ranks candidates descending by score", () => {
    const ranked = rankPersonalityCandidates("graham", () => true, FIXTURE_UNIVERSE);
    expect(ranked.length).toBe(4);
    for (let i = 0; i < ranked.length - 1; i++) {
      expect(ranked[i].score).toBeGreaterThanOrEqual(ranked[i + 1].score);
    }
  });

  it("fairly rewards high margin relative to sector peers", () => {
    // RETAIL1 has 8% margin in a 7% sector (outperformer)
    // TECH2 has 21% margin in a 23% sector (underperformer)
    const retailBench = { medianOperatingMargin: 7, medianRoe: 16 };
    const techBench = { medianOperatingMargin: 23, medianRoe: 25 };

    const retailScore = calculatePersonalityScore("buffett", FIXTURE_UNIVERSE[2], retailBench);
    const techScore = calculatePersonalityScore("buffett", FIXTURE_UNIVERSE[1], techBench);

    // Both should receive valid scores and retail should not be penalized just for lower absolute margin
    expect(retailScore).toBeGreaterThan(techScore);
    expect(retailScore).toBeGreaterThan(50);
    expect(techScore).toBeGreaterThan(45);
  });

  it("scores and ranks candidates for all 8 defined personalities", () => {
    expect(PERSONALITIES).toHaveLength(8);
    const benchmark = { medianOperatingMargin: 15, medianRoe: 18 };
    const sampleStock: Fundamentals = {
      symbol: "TEST1",
      sector: "Technology",
      peRatio: 18,
      pbRatio: 1.8,
      dividendYield: 2.0,
      roe: 22,
      debtToEquity: 0.3,
      operatingMargin: 20,
      revenueGrowth: 15,
      netProfit: 100,
    };

    for (const personality of PERSONALITIES) {
      const score = calculatePersonalityScore(personality.id, sampleStock, benchmark);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
      expect(Number.isFinite(score)).toBe(true);

      const ranked = rankPersonalityCandidates(personality.id, () => true, FIXTURE_UNIVERSE);
      expect(ranked.length).toBe(FIXTURE_UNIVERSE.length);
      for (let i = 0; i < ranked.length - 1; i++) {
        expect(ranked[i].score).toBeGreaterThanOrEqual(ranked[i + 1].score);
      }
    }
  });

  it("applies exact spec section 2.2 clamps and default fallbacks for updated formulas", () => {
    const benchmark = { medianOperatingMargin: 12, medianRoe: 15 };

    // lych: test fallback growth (15) and pe (25)
    const lychScoreDefault = calculatePersonalityScore("lych", { symbol: "LYCH_DEF" }, benchmark);
    expect(lychScoreDefault).toBe(52); // pegPts ~26.67 + roePts 15 + growthPts 9.9 = 51.57 -> 52

    // graham: dividend yield clamp [0.2, 1.0] * 15
    const grahamLowDiv = calculatePersonalityScore(
      "graham",
      { symbol: "GRAHAM_LOW", peRatio: 15, pbRatio: 1.5, dividendYield: 0, operatingMargin: 12 },
      benchmark,
    );
    // pePts: 0, pbPts: 0, marginPts: 7.5, divPts: clamp(0/5, 0.2, 1.0)*15 = 3 -> raw = 10.5 -> 11
    expect(grahamLowDiv).toBe(11);

    // greenblatt: earnings yield clamp [0.2, 1.0] * 40
    const greenblattHighPe = calculatePersonalityScore(
      "greenblatt",
      { symbol: "GB_HIGH_PE", peRatio: 100, roe: 15, debtToEquity: 0.5 },
      benchmark,
    );
    // eyPts: clamp((1/100)/(1/8), 0.2, 1.0)*40 = 0.2*40 = 8, roePts: (1/2)*40 = 20, debtPts: 0 -> raw = 28
    expect(greenblattHighPe).toBe(28);

    // dividend: dividend yield clamp [0.35, 1.0] * 45
    const divZero = calculatePersonalityScore(
      "dividend",
      { symbol: "DIV_ZERO", dividendYield: 0, roe: 15, peRatio: 25 },
      benchmark,
    );
    // divPts: clamp(0/7, 0.35, 1.0)*45 = 15.75, roePts: 15, pePts: 0 -> raw = 30.75 -> 31
    expect(divZero).toBe(31);

    // momentum: revenue growth clamp [0.35, 1.0] * 35
    const momentumZeroGrowth = calculatePersonalityScore(
      "momentum",
      { symbol: "MOM_ZERO", revenueGrowth: 0, operatingMargin: 12, roe: 15 },
      benchmark,
    );
    // growthPts: clamp(0/40, 0.35, 1.0)*35 = 12.25, marginPts: 17.5, roePts: 15 -> raw = 44.75 -> 45
    expect(momentumZeroGrowth).toBe(45);
  });
});
