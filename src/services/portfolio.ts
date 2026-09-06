import { assemblePortfolio, type PortfolioSnapshot } from "../engines/portfolio.js";
import type { Fundamentals, Holding } from "../types/index.js";
import type { Broker } from "./broker-types.js";

export interface FundamentalsStore {
  getFreshFundamentals(symbol: string, maxAgeMs?: number): Fundamentals | null;
  saveFundamentals(items: Fundamentals[]): void;
}

export interface MarketDataProvider {
  getFundamentals(symbol: string): Promise<Fundamentals>;
  getHistoricalPrices(symbol: string, range?: string): Promise<{ close: number }[]>;
}

/**
 * Portfolio intake: fetch holdings, cache-fresh Fundamentals, and price history,
 * then assemble advisory Recommendations. Never places an Order (ADR-0001).
 */
export async function loadPortfolio(
  broker: Broker,
  market: MarketDataProvider,
  store?: FundamentalsStore,
): Promise<PortfolioSnapshot> {
  const holdings = await broker.getHoldings();
  const observations = new Map<
    string,
    { fundamentals?: Fundamentals; dailyCloses?: { close: number }[] }
  >();

  await Promise.all(
    holdings.map(async (holding: Holding) => {
      try {
        let fundamentals = store?.getFreshFundamentals(holding.symbol) ?? undefined;
        if (!fundamentals) {
          fundamentals = await market.getFundamentals(holding.symbol);
          store?.saveFundamentals([fundamentals]);
        }
        const dailyCloses = await market.getHistoricalPrices(holding.symbol, "3mo");
        observations.set(holding.symbol, { fundamentals, dailyCloses });
      } catch {
        observations.set(holding.symbol, {});
      }
    }),
  );

  return assemblePortfolio(holdings, observations);
}
