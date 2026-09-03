import { parse } from "csv-parse/sync";
import { YahooFinanceService } from "../services/yahoo-finance.js";
import type { Fundamentals } from "../types/index.js";
import { mapWithConcurrency } from "./async.js";

const NSE_CSV_URL = "https://nsearchives.nseindia.com/content/indices/ind_nifty500list.csv";
const CONCURRENCY = 4;
const CACHE_TTL_MS = 30 * 60 * 1000;
const SYMBOL_TTL_MS = 24 * 60 * 60 * 1000;

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

const yahoo = new YahooFinanceService();
let symbolsCache: { at: number; symbols: string[] } | null = null;
let fundCache: { fetchedAt: number; data: Fundamentals[] } | null = null;
let inflight: Promise<Fundamentals[]> | null = null;

export async function getNifty500Symbols(): Promise<string[]> {
  if (symbolsCache && Date.now() - symbolsCache.at < SYMBOL_TTL_MS) return symbolsCache.symbols;
  const res = await fetch(NSE_CSV_URL, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) {
    throw new Error(`NSE index CSV fetch failed with HTTP ${res.status}`);
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
