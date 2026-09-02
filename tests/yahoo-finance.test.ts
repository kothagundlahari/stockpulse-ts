import { describe, it, expect, vi, beforeEach } from "vitest";
import { YahooFinanceService } from "../src/services/yahoo-finance.js";
import axios from "axios";

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
      })
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
});
