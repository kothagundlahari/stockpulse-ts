import { describe, it, expect, vi, beforeEach } from "vitest";
import { YahooFinanceService } from "../src/services/yahoo-finance.js";
import axios from "axios";

vi.mock("axios");
const mockedAxios = vi.mocked(axios);

describe("YahooFinanceService", () => {
  let service: YahooFinanceService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new YahooFinanceService();
  });

  it("fetches quote for a symbol", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        quoteResponse: {
          result: [
            {
              symbol: "RELIANCE.NS",
              shortName: "Reliance Industries",
              regularMarketPrice: 2500,
              regularMarketChange: 50,
              regularMarketChangePercent: 2.04,
              regularMarketOpen: 2480,
              regularMarketDayHigh: 2520,
              regularMarketDayLow: 2460,
              regularMarketPreviousClose: 2450,
              regularMarketVolume: 1000000,
              regularMarketTime: 1700000000,
            },
          ],
        },
      },
    });

    const quote = await service.getQuote("RELIANCE");
    expect(quote.symbol).toBe("RELIANCE");
    expect(quote.ltp).toBe(2500);
    expect(quote.change).toBe(50);
    expect(quote.volume).toBe(1000000);
  });

  it("fetches historical prices", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        chart: {
          result: [
            {
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

    const prices = await service.getHistoricalPrices("RELIANCE", "1mo");
    expect(prices).toHaveLength(3);
    expect(prices[0].close).toBe(102);
  });

  it("handles API errors gracefully", async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error("Network error"));

    await expect(service.getQuote("INVALID")).rejects.toThrow(
      "Network error"
    );
  });
});
