import type { ScreenerCriteria, Fundamentals } from "../types/index.js";

/**
 * Engine for filtering stocks based on screener criteria.
 * Each criterion is optional; only provided criteria are applied.
 */
export class ScreenerEngine {
  filter(stocks: Fundamentals[], criteria: ScreenerCriteria): Fundamentals[] {
    return stocks.filter((stock) => this.matchesAll(stock, criteria));
  }

  private matchesAll(
    stock: Fundamentals,
    criteria: ScreenerCriteria
  ): boolean {
    const checks: boolean[] = [];

    if (criteria.minMarketCap !== undefined) {
      checks.push(
        stock.marketCap !== undefined && stock.marketCap >= criteria.minMarketCap
      );
    }
    if (criteria.maxMarketCap !== undefined) {
      checks.push(
        stock.marketCap !== undefined && stock.marketCap <= criteria.maxMarketCap
      );
    }
    if (criteria.minPe !== undefined) {
      checks.push(
        stock.peRatio !== undefined && stock.peRatio >= criteria.minPe
      );
    }
    if (criteria.maxPe !== undefined) {
      checks.push(
        stock.peRatio !== undefined && stock.peRatio <= criteria.maxPe
      );
    }
    if (criteria.minPb !== undefined) {
      checks.push(
        stock.pbRatio !== undefined && stock.pbRatio >= criteria.minPb
      );
    }
    if (criteria.maxPb !== undefined) {
      checks.push(
        stock.pbRatio !== undefined && stock.pbRatio <= criteria.maxPb
      );
    }
    if (criteria.minDividendYield !== undefined) {
      checks.push(
        stock.dividendYield !== undefined &&
          stock.dividendYield >= criteria.minDividendYield
      );
    }
    if (criteria.minRoe !== undefined) {
      checks.push(
        stock.roe !== undefined && stock.roe >= criteria.minRoe
      );
    }
    if (criteria.maxDebtToEquity !== undefined) {
      checks.push(
        stock.debtToEquity !== undefined &&
          stock.debtToEquity <= criteria.maxDebtToEquity
      );
    }

    return checks.every(Boolean);
  }
}
