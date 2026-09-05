import { PERSONALITIES, type PersonalityDefinition } from "../data/personalities.js";
import type { Criteria, Fundamentals } from "../types/index.js";
import { type Candidate, rankPersonalityCandidates } from "./personality-ranker.js";

export interface PersonalityMetadata {
  id: string;
  name: string;
  description: string;
}

export interface PersonalityRun extends PersonalityMetadata {
  matches: number;
  candidates: Candidate[];
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
   * Executes an ad-hoc Criteria Screener run against the provided Universe.
   */
  runCriteria(universe: Fundamentals[], criteria: Criteria): Fundamentals[] {
    return universe.filter((member) => this.matchesAll(member, criteria));
  }

  /**
   * Executes a curated Personality run against the Universe,
   * returning Candidates ranked descending by their sector-benchmarked score.
   */
  runPersonality(universe: Fundamentals[], personalityId: string): Candidate[] {
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
      const candidates = this.runPersonality(universe, meta.id);
      return {
        id: meta.id,
        name: meta.name,
        description: meta.description,
        matches: candidates.length,
        candidates,
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
    const candidates = this.runPersonality(universe, personality.id);
    return {
      id: personality.id,
      name: personality.name,
      description: personality.description,
      total: universe.length,
      matches: candidates.length,
      candidates,
    };
  }

  private matchesAll(member: Fundamentals, criteria: Criteria): boolean {
    const checks: boolean[] = [];

    if (criteria.minMarketCap !== undefined) {
      checks.push(member.marketCap !== undefined && member.marketCap >= criteria.minMarketCap);
    }
    if (criteria.maxMarketCap !== undefined) {
      checks.push(member.marketCap !== undefined && member.marketCap <= criteria.maxMarketCap);
    }
    if (criteria.minPe !== undefined) {
      checks.push(member.peRatio !== undefined && member.peRatio >= criteria.minPe);
    }
    if (criteria.maxPe !== undefined) {
      checks.push(member.peRatio !== undefined && member.peRatio <= criteria.maxPe);
    }
    if (criteria.minPb !== undefined) {
      checks.push(member.pbRatio !== undefined && member.pbRatio >= criteria.minPb);
    }
    if (criteria.maxPb !== undefined) {
      checks.push(member.pbRatio !== undefined && member.pbRatio <= criteria.maxPb);
    }
    if (criteria.minDividendYield !== undefined) {
      checks.push(
        member.dividendYield !== undefined && member.dividendYield >= criteria.minDividendYield,
      );
    }
    if (criteria.minRoe !== undefined) {
      checks.push(member.roe !== undefined && member.roe >= criteria.minRoe);
    }
    if (criteria.maxDebtToEquity !== undefined) {
      checks.push(
        member.debtToEquity !== undefined && member.debtToEquity <= criteria.maxDebtToEquity,
      );
    }
    if (criteria.minRevenueGrowth !== undefined) {
      checks.push(
        member.revenueGrowth !== undefined && member.revenueGrowth >= criteria.minRevenueGrowth,
      );
    }

    return checks.every(Boolean);
  }
}

export const screener = new Screener();
