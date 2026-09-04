import { parse } from "csv-parse/sync";
import { YahooFinanceService } from "../services/yahoo-finance.js";
import type { Fundamentals } from "../types/index.js";
import { mapWithConcurrency } from "./async.js";

const NSE_CSV_URL = "https://nsearchives.nseindia.com/content/indices/ind_nifty500list.csv";
const CONCURRENCY = 4;
const CACHE_TTL_MS = 30 * 60 * 1000;
const SYMBOL_TTL_MS = 24 * 60 * 60 * 1000;

export function parseNifty500Csv(csv: string): string[] {
  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
  }) as Array<Record<string, string>>;
  const hasSymbol = rows.some((r) =>
    Object.keys(r).some((k) => k.trim().toLowerCase() === "symbol"),
  );
  if (!hasSymbol) {
    const raw = parse(csv, {
      skip_empty_lines: true,
      relax_column_count: true,
    });
    return Array.from(
      new Set(
        raw.map((r) =>
          String(r[0] ?? "")
            .trim()
            .toUpperCase(),
        ),
      ),
    ).filter(Boolean);
  }
  const symbols = rows.map((r) =>
    String(r.Symbol ?? r.symbol ?? "")
      .trim()
      .toUpperCase(),
  );
  return Array.from(new Set(symbols)).filter(Boolean);
}

const yahoo = new YahooFinanceService();
let symbolsCache: { at: number; symbols: string[] } | null = null;
let fundCache: { fetchedAt: number; data: Fundamentals[] } | null = null;
let inflight: Promise<Fundamentals[]> | null = null;

export async function getNifty500Symbols(): Promise<string[]> {
  if (symbolsCache && Date.now() - symbolsCache.at < SYMBOL_TTL_MS) return symbolsCache.symbols;
  const res = await fetch(NSE_CSV_URL, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) {
    throw new Error(`NSE index CSV request failed with status ${res.status}`);
  }
  const csv = await res.text();
  const symbols = parseNifty500Csv(csv);
  if (symbols.length < 50) {
    throw new Error("NSE index CSV returned an unexpectedly small symbol list; rejecting it.");
  }
  symbolsCache = { at: Date.now(), symbols };
  return symbols;
}

export async function getNifty500Fundamentals(force = false): Promise<Fundamentals[]> {
  if (!force && fundCache && Date.now() - fundCache.fetchedAt < CACHE_TTL_MS) return fundCache.data;
  if (inflight) return inflight;
  inflight = (async () => {
    const symbols = await getNifty500Symbols();
    const live = await mapWithConcurrency(symbols, CONCURRENCY, async (symbol) => {
      try {
        return await yahoo.getFundamentals(symbol);
      } catch {
        return { symbol } as Fundamentals;
      }
    });
    fundCache = { fetchedAt: Date.now(), data: live };
    inflight = null;
    return live;
  })();
  return inflight;
}

/**
 * Merge live rows over the parsed universe. Because getNifty500Fundamentals
 * already returns one row (live or symbol-only fallback) per universe symbol,
 * the live list is already the merged universe; this helper keeps the
 * "live over parsed universe" contract explicit for callers that merge.
 */
export function mergeOverNifty500(live: Fundamentals[]): Fundamentals[] {
  return live;
}
