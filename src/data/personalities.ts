import type { Fundamentals } from "../types/index.js";

export interface PersonalityScreener {
  id: string;
  name: string;
  description: string;
  filter: (s: Fundamentals) => boolean;
}

/**
 * Eight classic investor personalities. Each encodes the core
 * screening philosophy associated with that investor.
 */
export const PERSONALITIES: PersonalityScreener[] = [
  {
    id: "buffett",
    name: "Warren Buffett",
    description:
      "Quality compounding businesses: high and stable ROE, moderate leverage, strong margins.",
    filter: (s) =>
      (s.roe ?? 0) >= 15 && (s.debtToEquity ?? Infinity) <= 0.5 && (s.operatingMargin ?? 0) >= 15,
  },
  {
    id: "munger",
    name: "Charlie Munger",
    description: "High-quality moats with strong returns on capital at a reasonable price.",
    filter: (s) =>
      (s.roe ?? 0) >= 20 && (s.peRatio ?? Infinity) <= 35 && (s.debtToEquity ?? Infinity) <= 0.5,
  },
  {
    id: "lych",
    name: "Peter Lynch",
    description: "Growth at a reasonable price (GARP): strong growth with a sensible PEG.",
    filter: (s) =>
      (s.peRatio ?? Infinity) <= 30 &&
      (s.revenueGrowth ?? (s.netProfit ? 10 : 0)) >= 10 &&
      (s.netProfit ?? 0) > 0,
  },
  {
    id: "graham",
    name: "Benjamin Graham",
    description:
      "Deep value: conservative valuation, low debt, decent earnings and dividend yield.",
    filter: (s) =>
      (s.peRatio ?? Infinity) <= 15 &&
      (s.pbRatio ?? Infinity) <= 1.5 &&
      (s.dividendYield ?? 0) >= 1,
  },
  {
    id: "greenblatt",
    name: "Joel Greenblatt",
    description: "Magic Formula: high earnings yield combined with high return on capital.",
    filter: (s) =>
      (s.peRatio ?? Infinity) <= 20 && (s.roe ?? 0) >= 20 && (s.debtToEquity ?? Infinity) <= 0.5,
  },
  {
    id: "klarman",
    name: "Seth Klarman",
    description: "Margin of safety: buy quality assets trading well below intrinsic worth.",
    filter: (s) =>
      (s.pbRatio ?? Infinity) <= 2.0 && (s.debtToEquity ?? Infinity) <= 0.5 && (s.roe ?? 0) >= 10,
  },
  {
    id: "dividend",
    name: "Dividend Growth",
    description: "Income focus: attractive and safe dividend with reasonable valuation.",
    filter: (s) =>
      (s.dividendYield ?? 0) >= 2.5 && (s.peRatio ?? Infinity) <= 25 && (s.roe ?? 0) >= 12,
  },
  {
    id: "momentum",
    name: "Growth Momentum",
    description: "Strong growth with rising profitability and expanding scale.",
    filter: (s) =>
      (s.revenueGrowth ?? 0) >= 15 && (s.operatingMargin ?? 0) >= 18 && (s.roe ?? 0) >= 20,
  },
];
