import { PERSONALITIES, type SectorBenchmark } from "../data/personalities.js";
import type { Fundamentals } from "../types/index.js";

export type { SectorBenchmark };
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

/**
 * Computes sector benchmark statistics (median operating margin and ROE) across the universe.
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
 * Calculates a 0-100 hybrid sector-adjusted personality score by delegating
 * to the co-located personality scoring function.
 */
export function calculatePersonalityScore(
  personalityId: string,
  stock: Fundamentals,
  benchmark: SectorBenchmark,
): number {
  const p = PERSONALITIES.find((item) => item.id === personalityId);
  if (!p) {
    throw new Error(`Unknown personality '${personalityId}'`);
  }
  return p.score(stock, benchmark);
}

/**
 * Applies a Personality predicate, computes sector-adjusted scores for matched
 * candidates, and returns them sorted descending by score.
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
