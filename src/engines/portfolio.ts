import type { Fundamentals, Holding } from "../types/index.js";
import { type Recommendation, recommendHolding, smaFromDaily } from "./holding-recommendation.js";

export interface HoldingObservation {
  fundamentals?: Fundamentals;
  dailyCloses?: { close: number }[];
}

export interface EnrichedHolding extends Holding {
  recommendation: Recommendation;
}

export interface PortfolioSnapshot {
  total: number;
  holdings: EnrichedHolding[];
}

/**
 * Pure portfolio assembly: weights and advisory Recommendations from holdings
 * plus already-resolved observations. Never places an Order (ADR-0001).
 */
export function assemblePortfolio(
  holdings: Holding[],
  observations: ReadonlyMap<string, HoldingObservation> = new Map(),
): PortfolioSnapshot {
  const total = holdings.reduce((sum, h) => sum + h.currentValue, 0);
  const enriched = holdings.map((holding) => {
    const observed = observations.get(holding.symbol);
    const sma = observed?.dailyCloses ? smaFromDaily(observed.dailyCloses) : { sma10: 0, sma50: 0 };
    const weight = total > 0 ? (holding.currentValue / total) * 100 : 0;
    const recommendation = recommendHolding(
      observed?.fundamentals,
      { current: holding.ltp, sma10: sma.sma10, sma50: sma.sma50 },
      weight,
    );
    return { ...holding, recommendation };
  });
  return { total, holdings: enriched };
}
