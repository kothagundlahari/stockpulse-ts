import type { Fundamentals } from "../types/index.js";

export type RecommendationAction = "BUY_MORE" | "HOLD" | "SELL";
export type Confidence = "low" | "medium" | "high";

export interface Recommendation {
  action: RecommendationAction;
  confidence: Confidence;
  reasons: string[];
}

export interface PriceSignals {
  current: number;
  sma10: number;
  sma50: number;
}

const CONCENTRATION_SELL_THRESHOLD = 30; // % of portfolio

export function recommendHolding(
  fundamentals: Fundamentals | undefined,
  price: PriceSignals,
  portfolioWeightPct: number,
): Recommendation {
  const reasons: string[] = [];
  let score = 0;

  if (fundamentals) {
    const pe = fundamentals.peRatio;
    if (pe != null) {
      if (pe <= 18) {
        score += 1;
        reasons.push(`Valuation: P/E ${pe} is attractive`);
      } else if (pe >= 45) {
        score -= 1;
        reasons.push(`Valuation: P/E ${pe} is rich`);
      }
    }
    if ((fundamentals.roe ?? 0) >= 15) {
      score += 1;
      reasons.push(`Quality: ROE ${fundamentals.roe}% is strong`);
    }
    if ((fundamentals.debtToEquity ?? 0) > 2) {
      score -= 1;
      reasons.push("Risk: high debt-to-equity");
    }
    if ((fundamentals.revenueGrowth ?? 0) >= 10) {
      score += 1;
      reasons.push(`Growth: revenue growth ${fundamentals.revenueGrowth}%`);
    }
  } else {
    reasons.push("No fundamentals available");
  }

  if (
    price.sma10 > 0 &&
    price.current < price.sma10 &&
    price.sma50 > 0 &&
    price.current < price.sma50
  ) {
    score += 1;
    reasons.push("Momentum: price below both 10-day and 50-day SMAs (potential buy dip)");
  } else if (price.sma10 > 0 && price.sma50 > 0 && price.current > price.sma50) {
    score += 1;
    reasons.push("Momentum: price above 50-day SMA");
  }

  if (portfolioWeightPct > CONCENTRATION_SELL_THRESHOLD) {
    score -= 1;
    reasons.push(
      `Concentration: this holding is ${portfolioWeightPct.toFixed(1)}% of the portfolio — consider trimming`,
    );
  }

  let action: RecommendationAction = "HOLD";
  if (score >= 2) action = "BUY_MORE";
  else if (score <= -1) action = "SELL";
  else action = "HOLD";

  const confidence: Confidence = fundamentals ? (Math.abs(score) >= 2 ? "high" : "medium") : "low";
  if (action === "HOLD") reasons.push("Recommended to hold given mixed signal");

  return { action, confidence, reasons };
}

export function smaFromDaily(daily: { close: number }[]) {
  const closes = daily.map((d) => d.close);
  const sma = (period: number) => {
    if (closes.length < period) return 0;
    const slice = closes.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  };
  return { sma10: sma(10), sma50: sma(50) };
}
