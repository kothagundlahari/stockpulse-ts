import axios from "axios";
import type { Quote } from "../types/index.js";
import type { DailyPrice } from "../engines/backtest.js";

/**
 * Fetches stock data from Yahoo Finance API.
 * Uses the v8 chart and quote endpoints for free data.
 */
export class YahooFinanceService {
  private baseUrl = "https://query1.finance.yahoo.com/v8/finance";

  async getQuote(symbol: string): Promise<Quote> {
    const ticker = `${symbol}.NS`;
    const response = await axios.get(`${this.baseUrl}/quote`, {
      params: { symbols: ticker },
    });

    const data = response.data.quoteResponse.result[0];
    if (!data) {
      throw new Error(`No data found for ${symbol}`);
    }

    return {
      symbol,
      ltp: data.regularMarketPrice,
      change: data.regularMarketChange,
      changePercent: data.regularMarketChangePercent,
      open: data.regularMarketOpen,
      high: data.regularMarketDayHigh,
      low: data.regularMarketDayLow,
      previousClose: data.regularMarketPreviousClose,
      volume: data.regularMarketVolume,
      timestamp: new Date(data.regularMarketTime * 1000).toISOString(),
    };
  }

  async getHistoricalPrices(
    symbol: string,
    range: string = "1mo"
  ): Promise<DailyPrice[]> {
    const ticker = `${symbol}.NS`;
    const response = await axios.get(`${this.baseUrl}/chart`, {
      params: {
        symbol: ticker,
        range,
        interval: "1d",
      },
    });

    const result = response.data.chart.result[0];
    if (!result) {
      return [];
    }

    const timestamps = result.timestamp as number[];
    const quotes = result.indicators.quote[0];

    return timestamps.map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().split("T")[0],
      open: quotes.open[i],
      high: quotes.high[i],
      low: quotes.low[i],
      close: quotes.close[i],
      volume: quotes.volume[i],
    }));
  }

  async search(query: string): Promise<{ symbol: string; name: string }[]> {
    const response = await axios.get(
      "https://query2.finance.yahoo.com/v1/finance/search",
      {
        params: {
          q: query,
          quotesCount: 10,
          newsCount: 0,
        },
      }
    );

    return (response.data.quotes || [])
      .filter(
        (q: { exchange: string; quoteType: string }) =>
          q.exchange === "NSI" && q.quoteType === "EQUITY"
      )
      .map((q: { symbol: string; shortname: string }) => ({
        symbol: q.symbol.replace(".NS", ""),
        name: q.shortname,
      }));
  }
}
