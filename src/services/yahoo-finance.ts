import axios from "axios";
import type { DailyPrice } from "../engines/backtest.js";
import type { Quote } from "../types/index.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

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

  /** Fetch the latest quote from chart metadata (last trading day). */
  async getQuote(symbol: string): Promise<Quote> {
    const ticker = `${symbol}.NS`;
    const response = await axios.get(`${this.chartUrl}/${ticker}`, {
      params: { range: "1d", interval: "1d" },
      headers: this.headers,
    });

    const result = response.data.chart?.result?.[0];
    if (!result) {
      throw new Error(`No data found for ${symbol}`);
    }

    const meta = result.meta;
    const previousClose = meta.chartPreviousClose ?? meta.regularMarketPreviousClose;
    const price = meta.regularMarketPrice ?? previousClose;
    const change = price - previousClose;
    const changePercent =
      meta.regularMarketChangePercent ?? (previousClose ? (change / previousClose) * 100 : 0);

    // Prefer the latest OHLC bar for the day's open; fall back to meta.
    const bars = result.indicators?.quote?.[0];
    const lastIndex = bars ? bars.open.length - 1 : -1;

    return {
      symbol,
      ltp: price,
      change,
      changePercent,
      open: lastIndex >= 0 && bars.open[lastIndex] != null ? bars.open[lastIndex] : price,
      high: meta.regularMarketDayHigh ?? (lastIndex >= 0 ? bars.high[lastIndex] : price),
      low: meta.regularMarketDayLow ?? (lastIndex >= 0 ? bars.low[lastIndex] : price),
      previousClose,
      volume: meta.regularMarketVolume ?? (lastIndex >= 0 ? bars.volume[lastIndex] : 0),
      timestamp: new Date((meta.regularMarketTime ?? Date.now() / 1000) * 1000).toISOString(),
    };
  }

  async getHistoricalPrices(symbol: string, range: string = "1mo"): Promise<DailyPrice[]> {
    const ticker = `${symbol}.NS`;
    const response = await axios.get(`${this.chartUrl}/${ticker}`, {
      params: {
        range,
        interval: "1d",
        includeAdjustedClose: false,
      },
      headers: this.headers,
    });

    const result = response.data.chart?.result?.[0];
    if (!result) {
      return [];
    }

    const timestamps = result.timestamp as number[];
    const quotes = result.indicators?.quote?.[0];
    if (!timestamps || !quotes) {
      return [];
    }

    return timestamps
      .map((ts, i) => ({
        date: new Date(ts * 1000).toISOString().split("T")[0],
        open: quotes.open[i] ?? quotes.close[i],
        high: quotes.high[i] ?? quotes.close[i],
        low: quotes.low[i] ?? quotes.close[i],
        close: quotes.close[i],
        volume: quotes.volume[i] ?? 0,
      }))
      .filter((p) => p.close != null);
  }

  async search(query: string): Promise<{ symbol: string; name: string }[]> {
    const response = await axios.get("https://query2.finance.yahoo.com/v1/finance/search", {
      params: {
        q: query,
        quotesCount: 10,
        newsCount: 0,
      },
      headers: this.headers,
    });

    return (response.data.quotes || [])
      .filter(
        (q: { exchange: string; quoteType: string }) =>
          q.exchange === "NSI" && q.quoteType === "EQUITY",
      )
      .map((q: { symbol: string; shortname: string }) => ({
        symbol: q.symbol.replace(".NS", ""),
        name: q.shortname,
      }));
  }
}
