import type { Fundamentals } from "../types/index.js";

export interface SectorBenchmark {
  medianOperatingMargin: number;
  medianRoe: number;
}

export type RankedStock = Fundamentals & { score: number };

const DEFAULT_BENCHMARK: SectorBenchmark = {
  medianOperatingMargin: 12.0,
  medianRoe: 15.0,
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

/**
 * Computes sector benchmark statistics (median operating margin and ROE)
 * across the universe.
 */
export function computeSectorMedians(universe: Fundamentals[]): Map<string, SectorBenchmark> {
  const sectorGroups = new Map<string, { margins: number[]; roes: number[] }>();

  for (const s of universe) {
    const sector = s.sector?.trim() || "Other";
    let group = sectorGroups.get(sector);
    if (!group) {
      group = { margins: [], roes: [] };
      sectorGroups.set(sector, group);
    }
    if (typeof s.operatingMargin === "number" && !Number.isNaN(s.operatingMargin)) {
      group.margins.push(s.operatingMargin);
    }
    if (typeof s.roe === "number" && !Number.isNaN(s.roe)) {
      group.roes.push(s.roe);
    }
  }

  const result = new Map<string, SectorBenchmark>();
  for (const [sector, group] of sectorGroups.entries()) {
    result.set(sector, {
      medianOperatingMargin:
        group.margins.length > 0 ? median(group.margins) : DEFAULT_BENCHMARK.medianOperatingMargin,
      medianRoe: group.roes.length > 0 ? median(group.roes) : DEFAULT_BENCHMARK.medianRoe,
    });
  }

  return result;
}

/**
 * Calculates a 0-100 hybrid sector-adjusted personality score.
 */
export function calculatePersonalityScore(
  personalityId: string,
  stock: Fundamentals,
  benchmark: SectorBenchmark,
): number {
  const sectorMargin = benchmark.medianOperatingMargin > 0 ? benchmark.medianOperatingMargin : 12.0;
  const sectorRoe = benchmark.medianRoe > 0 ? benchmark.medianRoe : 15.0;

  const stockMargin = stock.operatingMargin ?? sectorMargin;
  const stockRoe = stock.roe ?? sectorRoe;

  // Normalized ratios against sector benchmark (range 0.5 to 2.0)
  const marginRatio = clamp(stockMargin / sectorMargin, 0.5, 2.0);
  const roeRatio = clamp(stockRoe / sectorRoe, 0.5, 2.0);

  let rawScore = 50;

  switch (personalityId) {
    case "buffett": {
      // Quality compounder: sector margin (35%), sector ROE (35%), low leverage (30%)
      const marginPts = (marginRatio / 2.0) * 35;
      const roePts = (roeRatio / 2.0) * 35;
      const de = clamp(stock.debtToEquity ?? 0.5, 0, 0.5);
      const debtPts = (1 - de / 0.5) * 30;
      rawScore = marginPts + roePts + debtPts;
      break;
    }
    case "munger": {
      // High-quality moat at reasonable valuation
      const roePts = (roeRatio / 2.0) * 40;
      const pe = clamp(stock.peRatio ?? 35, 0, 35);
      const pePts = (1 - pe / 35) * 35;
      const de = clamp(stock.debtToEquity ?? 0.5, 0, 0.5);
      const debtPts = (1 - de / 0.5) * 25;
      rawScore = roePts + pePts + debtPts;
      break;
    }
    case "lych": {
      // Growth at a reasonable price (GARP)
      const growth = stock.revenueGrowth ?? (stock.netProfit ? 10 : 0);
      const pe = stock.peRatio ?? 25;
      const peg = pe / Math.max(growth, 1);
      const pegPts = clamp(1 - (peg - 1) / 2, 0, 1) * 40;
      const roePts = (roeRatio / 2.0) * 30;
      const growthPts = clamp(growth / 30, 0.33, 1.0) * 30;
      rawScore = pegPts + roePts + growthPts;
      break;
    }
    case "graham": {
      // Deep value: PE discount (35%), PB discount (35%), dividend yield (15%), margin stability (15%)
      const pe = clamp(stock.peRatio ?? 15, 0, 15);
      const pePts = (1 - pe / 15) * 35;
      const pb = clamp(stock.pbRatio ?? 1.5, 0, 1.5);
      const pbPts = (1 - pb / 1.5) * 35;
      const divYield = clamp(stock.dividendYield ?? 1, 0, 5);
      const divPts = (divYield / 5) * 15;
      const marginPts = (marginRatio / 2.0) * 15;
      rawScore = pePts + pbPts + divPts + marginPts;
      break;
    }
    case "greenblatt": {
      // Magic Formula: Earnings Yield (1/PE) + Sector Return on Capital (ROE)
      const pe = clamp(stock.peRatio ?? 20, 5, 20);
      const eyPts = clamp(1 / pe / (1 / 8), 0.25, 1.0) * 40;
      const roePts = (roeRatio / 2.0) * 40;
      const de = clamp(stock.debtToEquity ?? 0.5, 0, 0.5);
      const debtPts = (1 - de / 0.5) * 20;
      rawScore = eyPts + roePts + debtPts;
      break;
    }
    case "klarman": {
      // Margin of safety: PB discount, low debt, sector ROE
      const pb = clamp(stock.pbRatio ?? 2.0, 0, 2.0);
      const pbPts = (1 - pb / 2.0) * 45;
      const de = clamp(stock.debtToEquity ?? 0.5, 0, 0.5);
      const debtPts = (1 - de / 0.5) * 30;
      const roePts = (roeRatio / 2.0) * 25;
      rawScore = pbPts + debtPts + roePts;
      break;
    }
    case "dividend": {
      // High sustainable dividend yield + quality
      const divYield = clamp(stock.dividendYield ?? 2.5, 0, 7.0);
      const divPts = (divYield / 7.0) * 45;
      const roePts = (roeRatio / 2.0) * 30;
      const pe = clamp(stock.peRatio ?? 25, 0, 25);
      const pePts = (1 - pe / 25) * 25;
      rawScore = divPts + roePts + pePts;
      break;
    }
    case "momentum": {
      // Strong revenue growth with high sector-relative margin & ROE
      const growth = clamp(stock.revenueGrowth ?? 15, 0, 40);
      const growthPts = (growth / 40) * 35;
      const marginPts = (marginRatio / 2.0) * 35;
      const roePts = (roeRatio / 2.0) * 30;
      rawScore = growthPts + marginPts + roePts;
      break;
    }
    default: {
      rawScore = (marginRatio / 2.0) * 50 + (roeRatio / 2.0) * 50;
      break;
    }
  }

  return Math.round(clamp(rawScore, 0, 100));
}

/**
 * Filters the universe by personality screener criteria, computes sector-adjusted
 * scores for matched candidates, and returns them sorted descending by score.
 */
export function rankPersonalityCandidates(
  personalityId: string,
  filter: (s: Fundamentals) => boolean,
  universe: Fundamentals[],
): RankedStock[] {
  const sectorMedians = computeSectorMedians(universe);
  const matched = universe.filter(filter);

  const ranked: RankedStock[] = matched.map((stock) => {
    const sector = stock.sector?.trim() || "Other";
    const benchmark = sectorMedians.get(sector) ?? DEFAULT_BENCHMARK;
    const score = calculatePersonalityScore(personalityId, stock, benchmark);
    return {
      ...stock,
      score,
    };
  });

  return ranked.sort((a, b) => b.score - a.score);
}
