import { PERSONALITIES, type PersonalityDefinition } from "../data/personalities.js";
import type { Fundamentals, ScreenerCriteria } from "../types/index.js";
import { type RankedStock, rankPersonalityCandidates } from "./personality-ranker.js";

export interface PersonalityMetadata {
  id: string;
  name: string;
  description: string;
}

export interface PersonalityRun extends PersonalityMetadata {
  matches: number;
  stocks: RankedStock[];
}

export interface PersonalityRunDetail extends PersonalityRun {
  total: number;
}

/**
 * Unified Screener engine for both ad-hoc Criteria screening and curated Personality runs.
 * Consolidates Criteria matching, Personality lookup, and benchmarked candidate ranking.
 */
export class Screener {
  /**
   * Returns metadata for all available curated investor personalities.
   */
  getPersonalities(): PersonalityMetadata[] {
    return PERSONALITIES.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
    }));
  }

  /**
   * Looks up a specific personality definition by id.
   */
  getPersonality(personalityId: string): PersonalityDefinition | undefined {
    return PERSONALITIES.find((p) => p.id === personalityId);
  }

  /**
   * Executes an ad-hoc criteria screener run against the provided stock universe.
   */
  runCriteria(stocks: Fundamentals[], criteria: ScreenerCriteria): Fundamentals[] {
    return stocks.filter((stock) => this.matchesAll(stock, criteria));
  }

  /**
   * Executes a curated Personality run against the Universe,
   * returning candidates ranked descending by their sector-benchmarked score.
   */
  runPersonality(universe: Fundamentals[], personalityId: string): RankedStock[] {
    const personality = this.getPersonality(personalityId);
    if (!personality) {
      throw new Error(`Unknown personality '${personalityId}'`);
    }
    return rankPersonalityCandidates(personality.id, personality.matches, universe);
  }

  /**
   * Runs every curated personality against the universe.
   */
  runAllPersonalities(universe: Fundamentals[]): {
    total: number;
    personalities: PersonalityRun[];
  } {
    const personalities = this.getPersonalities().map((meta) => {
      const stocks = this.runPersonality(universe, meta.id);
      return {
        id: meta.id,
        name: meta.name,
        description: meta.description,
        matches: stocks.length,
        stocks,
      };
    });
    return { total: universe.length, personalities };
  }

  /**
   * Runs one personality against the universe, or undefined if the id is unknown.
   */
  runPersonalityDetail(
    universe: Fundamentals[],
    personalityId: string,
  ): PersonalityRunDetail | undefined {
    const personality = this.getPersonality(personalityId);
    if (!personality) return undefined;
    const stocks = this.runPersonality(universe, personality.id);
    return {
      id: personality.id,
      name: personality.name,
      description: personality.description,
      total: universe.length,
      matches: stocks.length,
      stocks,
    };
  }

  private matchesAll(stock: Fundamentals, criteria: ScreenerCriteria): boolean {
    const checks: boolean[] = [];

    if (criteria.minMarketCap !== undefined) {
      checks.push(stock.marketCap !== undefined && stock.marketCap >= criteria.minMarketCap);
    }
    if (criteria.maxMarketCap !== undefined) {
      checks.push(stock.marketCap !== undefined && stock.marketCap <= criteria.maxMarketCap);
    }
    if (criteria.minPe !== undefined) {
      checks.push(stock.peRatio !== undefined && stock.peRatio >= criteria.minPe);
    }
    if (criteria.maxPe !== undefined) {
      checks.push(stock.peRatio !== undefined && stock.peRatio <= criteria.maxPe);
    }
    if (criteria.minPb !== undefined) {
      checks.push(stock.pbRatio !== undefined && stock.pbRatio >= criteria.minPb);
    }
    if (criteria.maxPb !== undefined) {
      checks.push(stock.pbRatio !== undefined && stock.pbRatio <= criteria.maxPb);
    }
    if (criteria.minDividendYield !== undefined) {
      checks.push(
        stock.dividendYield !== undefined && stock.dividendYield >= criteria.minDividendYield,
      );
    }
    if (criteria.minRoe !== undefined) {
      checks.push(stock.roe !== undefined && stock.roe >= criteria.minRoe);
    }
    if (criteria.maxDebtToEquity !== undefined) {
      checks.push(
        stock.debtToEquity !== undefined && stock.debtToEquity <= criteria.maxDebtToEquity,
      );
    }
    if (criteria.minRevenueGrowth !== undefined) {
      checks.push(
        stock.revenueGrowth !== undefined && stock.revenueGrowth >= criteria.minRevenueGrowth,
      );
    }

    return checks.every(Boolean);
  }
}

export const screener = new Screener();
