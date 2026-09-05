import type { Fundamentals } from "../types/index.js";

export interface SectorBenchmark {
  medianOperatingMargin: number;
  medianRoe: number;
}

export interface PersonalityDefinition {
  id: string;
  name: string;
  description: string;
  matches: (s: Fundamentals) => boolean;
  score: (stock: Fundamentals, benchmark: SectorBenchmark) => number;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

function getNormalizedRatios(stock: Fundamentals, benchmark: SectorBenchmark) {
  const sectorMargin = benchmark.medianOperatingMargin > 0 ? benchmark.medianOperatingMargin : 12.0;
  const sectorRoe = benchmark.medianRoe > 0 ? benchmark.medianRoe : 15.0;
  const stockMargin = stock.operatingMargin ?? sectorMargin;
  const stockRoe = stock.roe ?? sectorRoe;
  const marginRatio = clamp(stockMargin / sectorMargin, 0.5, 2.0);
  const roeRatio = clamp(stockRoe / sectorRoe, 0.5, 2.0);
  return { marginRatio, roeRatio };
}

/**
 * Eight classic investor personalities. Each encodes its screening criteria
 * and sector-adjusted scoring formula co-located in a single definition.
 */
export const PERSONALITIES: PersonalityDefinition[] = [
  {
    id: "buffett",
    name: "Warren Buffett",
    description:
      "Quality compounding businesses: high and stable ROE, moderate leverage, strong margins.",
    matches: (s) =>
      (s.roe ?? 0) >= 15 && (s.debtToEquity ?? Infinity) <= 0.5 && (s.operatingMargin ?? 0) >= 15,
    score: (stock, benchmark) => {
      const { marginRatio, roeRatio } = getNormalizedRatios(stock, benchmark);
      const marginPts = (marginRatio / 2.0) * 35;
      const roePts = (roeRatio / 2.0) * 35;
      const de = clamp(stock.debtToEquity ?? 0.5, 0, 0.5);
      const debtPts = (1 - de / 0.5) * 30;
      return Math.round(clamp(marginPts + roePts + debtPts, 0, 100));
    },
  },
  {
    id: "munger",
    name: "Charlie Munger",
    description: "High-quality moats with strong returns on capital at a reasonable price.",
    matches: (s) =>
      (s.roe ?? 0) >= 20 && (s.peRatio ?? Infinity) <= 35 && (s.debtToEquity ?? Infinity) <= 0.5,
    score: (stock, benchmark) => {
      const { roeRatio } = getNormalizedRatios(stock, benchmark);
      const roePts = (roeRatio / 2.0) * 40;
      const pe = clamp(stock.peRatio ?? 35, 0, 35);
      const pePts = (1 - pe / 35) * 35;
      const de = clamp(stock.debtToEquity ?? 0.5, 0, 0.5);
      const debtPts = (1 - de / 0.5) * 25;
      return Math.round(clamp(roePts + pePts + debtPts, 0, 100));
    },
  },
  {
    id: "lych",
    name: "Peter Lynch",
    description: "Growth at a reasonable price (GARP): strong growth with a sensible PEG.",
    matches: (s) =>
      (s.peRatio ?? Infinity) <= 30 &&
      (s.revenueGrowth ?? (s.netProfit ? 10 : 0)) >= 10 &&
      (s.netProfit ?? 0) > 0,
    score: (stock, benchmark) => {
      const { roeRatio } = getNormalizedRatios(stock, benchmark);
      const growth = Math.max(stock.revenueGrowth ?? 15, 1);
      const pe = stock.peRatio ?? 25;
      const peg = pe / growth;
      const pegPts = clamp(1 - (peg - 1) / 2, 0, 1) * 40;
      const roePts = (roeRatio / 2.0) * 30;
      const growthPts = clamp((stock.revenueGrowth ?? 10) / 30, 0.33, 1.0) * 30;
      return Math.round(clamp(pegPts + roePts + growthPts, 0, 100));
    },
  },
  {
    id: "graham",
    name: "Benjamin Graham",
    description:
      "Deep value: conservative valuation, low debt, decent earnings and dividend yield.",
    matches: (s) =>
      (s.peRatio ?? Infinity) <= 15 &&
      (s.pbRatio ?? Infinity) <= 1.5 &&
      (s.dividendYield ?? 0) >= 1,
    score: (stock, benchmark) => {
      const { marginRatio } = getNormalizedRatios(stock, benchmark);
      const pe = clamp(stock.peRatio ?? 15, 0, 15);
      const pePts = (1 - pe / 15) * 35;
      const pb = clamp(stock.pbRatio ?? 1.5, 0, 1.5);
      const pbPts = (1 - pb / 1.5) * 35;
      const divPts = clamp((stock.dividendYield ?? 1) / 5, 0.2, 1.0) * 15;
      const marginPts = (marginRatio / 2.0) * 15;
      return Math.round(clamp(pePts + pbPts + divPts + marginPts, 0, 100));
    },
  },
  {
    id: "greenblatt",
    name: "Joel Greenblatt",
    description: "Magic Formula: high earnings yield combined with high return on capital.",
    matches: (s) =>
      (s.peRatio ?? Infinity) <= 20 && (s.roe ?? 0) >= 20 && (s.debtToEquity ?? Infinity) <= 0.5,
    score: (stock, benchmark) => {
      const { roeRatio } = getNormalizedRatios(stock, benchmark);
      const eyPts = clamp(1 / (stock.peRatio ?? 20) / (1 / 8), 0.2, 1.0) * 40;
      const roePts = (roeRatio / 2.0) * 40;
      const de = clamp(stock.debtToEquity ?? 0.5, 0, 0.5);
      const debtPts = (1 - de / 0.5) * 20;
      return Math.round(clamp(eyPts + roePts + debtPts, 0, 100));
    },
  },
  {
    id: "klarman",
    name: "Seth Klarman",
    description: "Margin of safety: buy quality assets trading well below intrinsic worth.",
    matches: (s) =>
      (s.pbRatio ?? Infinity) <= 2.0 && (s.debtToEquity ?? Infinity) <= 0.5 && (s.roe ?? 0) >= 10,
    score: (stock, benchmark) => {
      const { roeRatio } = getNormalizedRatios(stock, benchmark);
      const pb = clamp(stock.pbRatio ?? 2.0, 0, 2.0);
      const pbPts = (1 - pb / 2.0) * 45;
      const de = clamp(stock.debtToEquity ?? 0.5, 0, 0.5);
      const debtPts = (1 - de / 0.5) * 30;
      const roePts = (roeRatio / 2.0) * 25;
      return Math.round(clamp(pbPts + debtPts + roePts, 0, 100));
    },
  },
  {
    id: "dividend",
    name: "Dividend Growth",
    description: "Income focus: attractive and safe dividend with reasonable valuation.",
    matches: (s) =>
      (s.dividendYield ?? 0) >= 2.5 && (s.peRatio ?? Infinity) <= 25 && (s.roe ?? 0) >= 12,
    score: (stock, benchmark) => {
      const { roeRatio } = getNormalizedRatios(stock, benchmark);
      const divPts = clamp((stock.dividendYield ?? 2.5) / 7.0, 0.35, 1.0) * 45;
      const roePts = (roeRatio / 2.0) * 30;
      const pe = clamp(stock.peRatio ?? 25, 0, 25);
      const pePts = (1 - pe / 25) * 25;
      return Math.round(clamp(divPts + roePts + pePts, 0, 100));
    },
  },
  {
    id: "momentum",
    name: "Growth Momentum",
    description: "Strong growth with rising profitability and expanding scale.",
    matches: (s) =>
      (s.revenueGrowth ?? 0) >= 15 && (s.operatingMargin ?? 0) >= 18 && (s.roe ?? 0) >= 20,
    score: (stock, benchmark) => {
      const { marginRatio, roeRatio } = getNormalizedRatios(stock, benchmark);
      const growthPts = clamp((stock.revenueGrowth ?? 15) / 40, 0.35, 1.0) * 35;
      const marginPts = (marginRatio / 2.0) * 35;
      const roePts = (roeRatio / 2.0) * 30;
      return Math.round(clamp(growthPts + marginPts + roePts, 0, 100));
    },
  },
];
