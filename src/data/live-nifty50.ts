import { YahooFinanceService } from "../services/yahoo-finance.js";
import type { Fundamentals } from "../types/index.js";
import { NIFTY50 } from "./nifty50.js";

const CONCURRENCY = 4;
const CACHE_TTL_MS = 15 * 60 * 1000;

const yahoo = new YahooFinanceService();

let cache: { fetchedAt: number; data: Fundamentals[] } | null = null;
let inflight: Promise<Fundamentals[]> | null = null;

function isCacheFresh(): boolean {
  return cache !== null && Date.now() - cache.fetchedAt <= CACHE_TTL_MS;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

/** Fetch live fundamentals for every NIFTY 50 constituent, using a short-lived cache. */
export async function getLiveNifty50Fundamentals(force = false): Promise<Fundamentals[]> {
  if (!force && isCacheFresh() && cache) return cache.data;
  if (inflight) return inflight;

  inflight = (async () => {
    const symbols = NIFTY50.map((s) => s.symbol);
    const live = await mapWithConcurrency(symbols, CONCURRENCY, async (symbol) => {
      try {
        return await yahoo.getFundamentals(symbol);
      } catch {
        // Fall back to the bundled static snapshot for any symbol we can't fetch.
        const staticRow = NIFTY50.find((s) => s.symbol === symbol);
        return staticRow ?? { symbol };
      }
    });

    cache = { fetchedAt: Date.now(), data: live };
    inflight = null;
    return live;
  })();

  return inflight;
}

/** Merge live fundamentals over the bundled snapshot so every field stays populated. */
export function mergeFundamentals(live: Fundamentals[]): Fundamentals[] {
  return NIFTY50.map((staticRow) => {
    const liveRow = live.find((s) => s.symbol === staticRow.symbol);
    return { ...staticRow, ...liveRow };
  });
}
