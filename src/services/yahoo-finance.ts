import axios from "axios";
import YahooFinance from "yahoo-finance2";
import type { DailyPrice } from "../engines/backtest.js";
import type { Fundamentals, Quote } from "../types/index.js";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

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
    const change = previousClose != null ? price - previousClose : 0;
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
