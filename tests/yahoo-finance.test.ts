import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { YahooFinanceService } from "../src/services/yahoo-finance.js";

vi.mock("axios");
const mockedAxios = vi.mocked(axios);

const chartResponse = (overrides?: object) => ({
  data: {
    chart: {
      result: [
        {
          meta: {
            symbol: "RELIANCE.NS",
            currency: "INR",
            regularMarketPrice: 2500,
            regularMarketDayHigh: 2520,
            regularMarketDayLow: 2460,
            regularMarketOpen: 2480,
            regularMarketVolume: 1000000,
            regularMarketTime: 1700000000,
            chartPreviousClose: 2450,
            ...overrides,
          },
          timestamp: [1700000000, 1700086400, 1700172800],
          indicators: {
            quote: [
              {
                open: [100, 102, 104],
                high: [105, 106, 107],
                low: [99, 101, 102],
                close: [102, 104, 103],
                volume: [1000, 1200, 1100],
              },
            ],
          },
        },
      ],
    },
  },
});

describe("YahooFinanceService", () => {
  let service: YahooFinanceService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new YahooFinanceService();
  });

  it("fetches quote from chart metadata", async () => {
    mockedAxios.get.mockResolvedValueOnce(chartResponse());

    const quote = await service.getQuote("RELIANCE");
    expect(quote.symbol).toBe("RELIANCE");
    expect(quote.ltp).toBe(2500);
    expect(quote.volume).toBe(1000000);
    expect(quote.previousClose).toBe(2450);
    // change = 2500 - 2450 = 50, changePercent = 50/2450 = 2.0408%
    expect(quote.change).toBeCloseTo(50, 5);
    expect(quote.changePercent).toBeCloseTo(2.0408, 1);
  });

  it("sends a browser-style User-Agent header", async () => {
    mockedAxios.get.mockResolvedValueOnce(chartResponse());

    await service.getQuote("RELIANCE");
    expect(mockedAxios.get).toHaveBeenCalledWith(
      "https://query1.finance.yahoo.com/v8/finance/chart/RELIANCE.NS",
      expect.objectContaining({
        headers: expect.objectContaining({ "User-Agent": expect.stringContaining("Mozilla") }),
      }),
    );
  });

  it("fetches historical prices", async () => {
    mockedAxios.get.mockResolvedValueOnce(chartResponse());

    const prices = await service.getHistoricalPrices("RELIANCE", "1mo");
    expect(prices).toHaveLength(3);
    expect(prices[0].close).toBe(102);
    expect(prices[0].open).toBe(100);
  });

  it("returns empty array when chart has no result", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { chart: { result: [] } } });
    const prices = await service.getHistoricalPrices("RELIANCE");
    expect(prices).toHaveLength(0);
  });

  it("throws a clear error when no stock data found", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { chart: { result: [] } } });
    await expect(service.getQuote("INVALID")).rejects.toThrow("No data found");
  });

  it("handles API errors gracefully", async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error("Network error"));
    await expect(service.getQuote("INVALID")).rejects.toThrow("Network error");
  });

  it("does not produce NaN when previousClose is missing", async () => {
    mockedAxios.get.mockResolvedValueOnce(
      chartResponse({ chartPreviousClose: undefined, regularMarketPreviousClose: undefined }),
    );

    const quote = await service.getQuote("RELIANCE");
    expect(quote.change).toBe(0);
    expect(quote.changePercent).toBe(0);
    expect(quote.previousClose).toBe(0);
    expect(Number.isNaN(quote.change)).toBe(false);
    expect(Number.isNaN(quote.changePercent)).toBe(false);
  });

  it("throws when chart metadata has no price", async () => {
    mockedAxios.get.mockResolvedValueOnce(
      chartResponse({
        regularMarketPrice: undefined,
        chartPreviousClose: undefined,
        regularMarketPreviousClose: undefined,
      }),
    );
    await expect(service.getQuote("RELIANCE")).rejects.toThrow("No data found");
  });

  it("skips a non-numeric timestamp without shifting later closes", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        chart: {
          result: [
            {
              meta: { regularMarketPrice: 30 },
              timestamp: [1700000000, "bad", 1700172800],
              indicators: {
                quote: [
                  {
                    open: [10, 20, 30],
                    high: [10, 20, 30],
                    low: [10, 20, 30],
                    close: [10, 20, 30],
                    volume: [1, 2, 3],
                  },
                ],
              },
            },
          ],
        },
      },
    });

    const prices = await service.getHistoricalPrices("RELIANCE");
    expect(prices.map((p) => p.close)).toEqual([10, 30]);
  });

  it("keeps a history bar when open, high, and low are null but close is present", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        chart: {
          result: [
            {
              meta: { regularMarketPrice: 102 },
              timestamp: [1700000000],
              indicators: {
                quote: [
                  {
                    open: [null],
                    high: [null],
                    low: [null],
                    close: [102],
                    volume: [null],
                  },
                ],
              },
            },
          ],
        },
      },
    });

    const prices = await service.getHistoricalPrices("RELIANCE");
    expect(prices).toHaveLength(1);
    expect(prices[0].close).toBe(102);
    expect(prices[0].open).toBe(102);
    expect(prices[0].high).toBe(102);
    expect(prices[0].low).toBe(102);
    expect(prices[0].volume).toBe(0);
  });
});
