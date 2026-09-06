import { parse } from "csv-parse/sync";
import { type Fundamentals, FundamentalsSchema } from "../types/index.js";

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

const NSE_CSV_URL = "https://nsearchives.nseindia.com/content/indices/ind_nifty500list.csv";
const CONCURRENCY = 4;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SYMBOL_TTL_MS = 24 * 60 * 60 * 1000;

class FreshMemo<T> {
  private entry: { value: T; expiresAt: number } | undefined;

  constructor(private readonly ttlMs: number) {}

  getFresh(): T | undefined {
    if (!this.entry || Date.now() >= this.entry.expiresAt) return undefined;
    return this.entry.value;
  }

  getLast(): T | undefined {
    return this.entry?.value;
  }

  set(value: T): void {
    this.entry = { value, expiresAt: Date.now() + this.ttlMs };
  }

  clear(): void {
    this.entry = undefined;
  }
}

export function parseNifty500Csv(csv: string): string[] {
  const rows = parse(csv, { skip_empty_lines: true, relax_column_count: true }) as string[][];
  const symbols = new Set<string>();
  const firstRow = rows[0] ?? [];
  const headerTokens = firstRow.map((h) => String(h).trim().toUpperCase());
  const symbolCol = headerTokens.indexOf("SYMBOL");
  const dataRows = symbolCol >= 0 ? rows.slice(1) : rows;
  for (const row of dataRows) {
    const cell = symbolCol >= 0 ? row[symbolCol] : row[0];
    const v = String(cell ?? "")
      .trim()
      .toUpperCase();
    if (v && v !== "SYMBOL" && /^[A-Z0-9&.-]+$/.test(v)) symbols.add(v);
  }
  return Array.from(symbols);
}

const symbolsMemo = new FreshMemo<string[]>(SYMBOL_TTL_MS);
let lastUniverse: Fundamentals[] | null = null;
let inflight: Promise<Fundamentals[]> | null = null;

export function resetNifty500CacheForTesting(): void {
  symbolsMemo.clear();
  lastUniverse = null;
  inflight = null;
}

/** Production constituent-list adapter: live NSE CSV with in-process memo. */
export async function getNifty500Symbols(): Promise<string[]> {
  const fresh = symbolsMemo.getFresh();
  if (fresh) return fresh;
  try {
    const res = await fetch(NSE_CSV_URL, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) {
      throw new Error(`NSE index CSV fetch failed with HTTP ${res.status}`);
    }
    const csv = await res.text();
    const symbols = parseNifty500Csv(csv);
    if (symbols.length < 50) {
      throw new Error("NSE index CSV returned an unexpectedly small symbol list; rejecting it.");
    }
    symbolsMemo.set(symbols);
    return symbols;
  } catch (err) {
    const last = symbolsMemo.getLast();
    if (last) return last;
    throw err;
  }
}

export interface UniverseMarket {
  getFundamentals(symbol: string): Promise<Fundamentals>;
}

export interface UniverseStore {
  getAllFreshFundamentals(maxAgeMs: number): Fundamentals[];
  getFreshFundamentals(symbol: string, maxAgeMs: number): Fundamentals | null;
  getCachedFundamentals(symbol: string): { data: Fundamentals } | null;
  saveFundamentals(items: Fundamentals[]): void;
  getAllCachedFundamentals(): { data: Fundamentals }[];
}

export interface UniverseLoadAdapters {
  store: UniverseStore;
  market: UniverseMarket;
  listSymbols: () => Promise<string[]>;
}

export async function getNifty500Fundamentals(
  adapters: UniverseLoadAdapters,
  options: { force?: boolean } = {},
): Promise<Fundamentals[]> {
  const { store, market, listSymbols } = adapters;
  const force = options.force ?? false;

  if (!force) {
    const fresh = store.getAllFreshFundamentals(CACHE_TTL_MS);
    if (fresh.length > 0) {
      return fresh;
    }
  }

  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const symbols = await listSymbols();
      const live = await mapWithConcurrency(symbols, CONCURRENCY, async (symbol) => {
        try {
          return await market.getFundamentals(symbol);
        } catch {
          const freshItem = store.getFreshFundamentals(symbol, SYMBOL_TTL_MS);
          if (freshItem) return freshItem;
          const cachedItem = store.getCachedFundamentals(symbol);
          if (cachedItem) return cachedItem.data;
          return FundamentalsSchema.parse({ symbol });
        }
      });
      store.saveFundamentals(live);
      lastUniverse = live;
      return live;
    } catch (err) {
      const fallback = store.getAllCachedFundamentals();
      if (fallback.length > 0) {
        const data = fallback.map((c) => c.data);
        lastUniverse = data;
        return data;
      }
      if (lastUniverse) return lastUniverse;
      throw err;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
