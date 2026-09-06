import axios from "axios";
import YahooFinance from "yahoo-finance2";
import {
  type Fundamentals,
  type HistoricalPrice,
  HistoricalPriceSchema,
  type Quote,
  QuoteSchema,
} from "../types/index.js";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

interface ChartBars {
  open: unknown[];
  high: unknown[];
  low: unknown[];
  close: unknown[];
  volume: unknown[];
}

interface ParsedChart {
  meta: Record<string, unknown>;
  timestamp?: unknown[];
  bars?: ChartBars;
}

function parseChartPayload(data: unknown): ParsedChart | undefined {
  if (!isRecord(data)) return undefined;
  const chart = data.chart;
  if (!isRecord(chart)) return undefined;
  const first = Array.isArray(chart.result) ? chart.result[0] : undefined;
  if (!isRecord(first)) return undefined;
  const meta = first.meta;
  if (!isRecord(meta)) return undefined;

  const timestamp = Array.isArray(first.timestamp) ? first.timestamp : undefined;

  const indicators = isRecord(first.indicators) ? first.indicators : undefined;
  const quote0 = Array.isArray(indicators?.quote) ? indicators.quote[0] : undefined;
  let bars: ChartBars | undefined;
  if (isRecord(quote0)) {
    const open = Array.isArray(quote0.open) ? quote0.open : undefined;
    const high = Array.isArray(quote0.high) ? quote0.high : undefined;
    const low = Array.isArray(quote0.low) ? quote0.low : undefined;
    const close = Array.isArray(quote0.close) ? quote0.close : undefined;
    const volume = Array.isArray(quote0.volume) ? quote0.volume : [];
    if (open && high && low && close) {
      bars = { open, high, low, close, volume };
    }
  }

  return { meta, timestamp, bars };
}

/**
 * Fetches stock data from Yahoo Finance's v8 chart endpoint.
 *
 * Note: Yahoo now requires a browser User-Agent header; the raw quote
 * endpoint returns 404 without one, so we source live quotes from the
 * chart metadata (which is more permissive and returns the same fields).
 */
export class YahooFinanceService {
  private chartUrl = "https://query1.finance.yahoo.com/v8/finance/chart";

  private headers = {
    "User-Agent": USER_AGENT,
    Accept: "application/json",
  };

  private async fetchChart(
    symbol: string,
    params: Record<string, string | boolean>,
  ): Promise<ParsedChart | undefined> {
    const ticker = `${symbol}.NS`;
    const response = await axios.get(`${this.chartUrl}/${ticker}`, {
      params,
      headers: this.headers,
    });
    return parseChartPayload(response.data);
  }

  /** Fetch the latest quote from chart metadata (last trading day). */
  async getQuote(symbol: string): Promise<Quote> {
    const result = await this.fetchChart(symbol, { range: "1d", interval: "1d" });
    if (!result) {
      throw new Error(`No data found for ${symbol}`);
    }

    const meta = result.meta;
    const previousClose =
      finiteNumber(meta.chartPreviousClose) ?? finiteNumber(meta.regularMarketPreviousClose);
    const price = finiteNumber(meta.regularMarketPrice) ?? previousClose;
    if (price == null) {
      throw new Error(`No data found for ${symbol}`);
    }
    const change = previousClose != null ? price - previousClose : 0;
    const changePercent =
      finiteNumber(meta.regularMarketChangePercent) ??
      (previousClose ? (change / previousClose) * 100 : 0);

    const bars = result.bars;
    const lastIndex = bars ? bars.open.length - 1 : -1;
    const lastOpen = lastIndex >= 0 && bars ? finiteNumber(bars.open[lastIndex]) : undefined;
    const lastHigh = lastIndex >= 0 && bars ? finiteNumber(bars.high[lastIndex]) : undefined;
    const lastLow = lastIndex >= 0 && bars ? finiteNumber(bars.low[lastIndex]) : undefined;
    const lastVolume = lastIndex >= 0 && bars ? finiteNumber(bars.volume[lastIndex]) : undefined;

    return QuoteSchema.parse({
      symbol,
      ltp: price,
      change,
      changePercent,
      open: lastOpen ?? price,
      high: finiteNumber(meta.regularMarketDayHigh) ?? lastHigh ?? price,
      low: finiteNumber(meta.regularMarketDayLow) ?? lastLow ?? price,
      previousClose: previousClose ?? 0,
      volume: finiteNumber(meta.regularMarketVolume) ?? lastVolume ?? 0,
      timestamp: new Date(
        (finiteNumber(meta.regularMarketTime) ?? Date.now() / 1000) * 1000,
      ).toISOString(),
    });
  }

  async getHistoricalPrices(symbol: string, range: string = "1mo"): Promise<HistoricalPrice[]> {
    const result = await this.fetchChart(symbol, {
      range,
      interval: "1d",
      includeAdjustedClose: false,
    });
    if (!result) {
      return [];
    }

    const timestamps = result.timestamp;
    const quotes = result.bars;
    if (!timestamps || !quotes) {
      return [];
    }

    return timestamps.flatMap((ts, i) => {
      if (typeof ts !== "number") return [];
      const close = finiteNumber(quotes.close[i]);
      if (close == null) return [];
      const parsed = HistoricalPriceSchema.safeParse({
        date: new Date(ts * 1000).toISOString().split("T")[0],
        open: finiteNumber(quotes.open[i]) ?? close,
        high: finiteNumber(quotes.high[i]) ?? close,
        low: finiteNumber(quotes.low[i]) ?? close,
        close,
        volume: finiteNumber(quotes.volume[i]) ?? 0,
      });
      return parsed.success ? [parsed.data] : [];
    });
  }

  /** Fetch live fundamentals from Yahoo Finance quoteSummary. */
  async getFundamentals(symbol: string): Promise<Fundamentals> {
    const ticker = `${symbol}.NS`;
    const data = await yf.quoteSummary(ticker, {
      modules: ["summaryDetail", "defaultKeyStatistics", "financialData", "assetProfile"],
    });

    const sd = (data.summaryDetail ?? {}) as Record<string, number | undefined>;
    const dks = (data.defaultKeyStatistics ?? {}) as Record<string, number | undefined>;
    const fd = (data.financialData ?? {}) as Record<string, number | undefined>;
    const ap = (data.assetProfile ?? {}) as Record<string, string | undefined>;

    const sharesOutstanding = dks.sharesOutstanding ?? 0;
    const bookValue = dks.bookValue ?? 0;
    const netIncome = dks.netIncomeToCommon ?? 0;
    const equity = bookValue * sharesOutstanding;
    const roe = equity > 0 ? (netIncome / equity) * 100 : undefined;

    return {
      symbol,
      marketCap: sd.marketCap ? sd.marketCap / 1e7 : undefined,
      peRatio: sd.trailingPE ?? undefined,
      pbRatio: dks.priceToBook ?? undefined,
      dividendYield: sd.dividendYield != null ? sd.dividendYield * 100 : undefined,
      eps: dks.trailingEps ?? undefined,
      roe: roe != null && Number.isFinite(roe) ? roe : undefined,
      debtToEquity: fd.debtToEquity != null ? fd.debtToEquity / 100 : undefined,
      revenue: fd.totalRevenue ? fd.totalRevenue / 1e7 : undefined,
      netProfit: netIncome ? netIncome / 1e7 : undefined,
      operatingMargin: fd.operatingMargins != null ? fd.operatingMargins * 100 : undefined,
      revenueGrowth: fd.revenueGrowth != null ? fd.revenueGrowth * 100 : undefined,
      sector: ap.sector ?? undefined,
    };
  }
}
