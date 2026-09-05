import { describe, expect, it, vi } from "vitest";
import { assemblePortfolio } from "../src/engines/portfolio.js";
import { createInMemoryBroker } from "../src/services/in-memory-broker.js";
import { loadPortfolio } from "../src/services/portfolio.js";
import type { Fundamentals } from "../src/types/index.js";

const TCS_HOLDING = {
  symbol: "TCS",
  quantity: 10,
  averagePrice: 3500,
  ltp: 3600,
  pnl: 1000,
  pnlPercent: 2.85,
  dayChange: 20,
  dayChangePercent: 0.55,
  currentValue: 36000,
};

const INFY_HOLDING = {
  symbol: "INFY",
  quantity: 5,
  averagePrice: 1400,
  ltp: 1500,
  pnl: 500,
  pnlPercent: 7.14,
  dayChange: 10,
  dayChangePercent: 0.67,
  currentValue: 7500,
};

function stubMarket(
  overrides: {
    fundamentals?: Record<string, Fundamentals>;
    prices?: { close: number }[];
    failSymbol?: string;
  } = {},
) {
  return {
    getFundamentals: vi.fn(async (symbol: string): Promise<Fundamentals> => {
      if (overrides.failSymbol === symbol) {
        throw new Error("market down");
      }
      return (
        overrides.fundamentals?.[symbol] ?? {
          symbol,
          peRatio: 20,
          roe: 18,
          debtToEquity: 0.2,
          revenueGrowth: 12,
        }
      );
    }),
    getHistoricalPrices: vi.fn(async (symbol: string) => {
      if (overrides.failSymbol === symbol) {
        throw new Error("market down");
      }
      return overrides.prices ?? Array.from({ length: 50 }, (_, i) => ({ close: 1000 + i }));
    }),
  };
}

describe("loadPortfolio", () => {
  it("enriches holdings with weights, SMAs, and advisory recommendations", async () => {
    const broker = createInMemoryBroker({
      holdings: [TCS_HOLDING, INFY_HOLDING],
    });
    const market = stubMarket({
      fundamentals: {
        TCS: { symbol: "TCS", peRatio: 12, roe: 22, debtToEquity: 0.2, revenueGrowth: 15 },
        INFY: { symbol: "INFY", peRatio: 28, roe: 30, debtToEquity: 0.1, revenueGrowth: 8 },
      },
    });

    const snapshot = await loadPortfolio(broker, market);

    expect(snapshot.total).toBe(43500);
    expect(snapshot.holdings).toHaveLength(2);
    expect(snapshot.holdings[0]?.symbol).toBe("TCS");
    expect(snapshot.holdings[0]?.recommendation).toBeDefined();
    expect(["BUY_MORE", "HOLD", "SELL"]).toContain(snapshot.holdings[0]?.recommendation.action);
    expect(["low", "medium", "high"]).toContain(snapshot.holdings[0]?.recommendation.confidence);
    expect(Array.isArray(snapshot.holdings[0]?.recommendation.reasons)).toBe(true);
    expect(await broker.getOrders()).toHaveLength(0);
  });

  it("uses cache-fresh fundamentals and does not refetch them", async () => {
    const broker = createInMemoryBroker({ holdings: [TCS_HOLDING] });
    const cached: Fundamentals = { symbol: "TCS", peRatio: 28, roe: 35, marketCap: 1200000 };
    const store = {
      getFreshFundamentals: vi.fn(() => cached),
      saveFundamentals: vi.fn(),
    };
    const market = stubMarket();

    const snapshot = await loadPortfolio(broker, market, store);

    expect(snapshot.holdings[0]?.symbol).toBe("TCS");
    expect(store.getFreshFundamentals).toHaveBeenCalledWith("TCS");
    expect(market.getFundamentals).not.toHaveBeenCalled();
    expect(store.saveFundamentals).not.toHaveBeenCalled();
  });

  it("fetches and stores fundamentals on a cache miss", async () => {
    const broker = createInMemoryBroker({ holdings: [INFY_HOLDING] });
    const store = {
      getFreshFundamentals: vi.fn(() => null),
      saveFundamentals: vi.fn(),
    };
    const fetched: Fundamentals = {
      symbol: "INFY",
      peRatio: 25,
      roe: 22,
      debtToEquity: 0.1,
    };
    const market = stubMarket({ fundamentals: { INFY: fetched } });

    await loadPortfolio(broker, market, store);

    expect(market.getFundamentals).toHaveBeenCalledWith("INFY");
    expect(store.saveFundamentals).toHaveBeenCalledWith([fetched]);
  });

  it("still returns holdings and a low-confidence recommendation when market data fails", async () => {
    const broker = createInMemoryBroker({ holdings: [TCS_HOLDING] });
    const market = stubMarket({ failSymbol: "TCS" });

    const snapshot = await loadPortfolio(broker, market);

    expect(snapshot.total).toBe(36000);
    expect(snapshot.holdings).toHaveLength(1);
    expect(snapshot.holdings[0]?.recommendation.confidence).toBe("low");
  });

  it("does not place orders as part of loading a portfolio", async () => {
    const broker = createInMemoryBroker({ holdings: [TCS_HOLDING] });
    const ordersBefore = await broker.getOrders();
    await loadPortfolio(broker, stubMarket());
    expect(await broker.getOrders()).toEqual(ordersBefore);
  });
});

describe("assemblePortfolio", () => {
  it("computes total value and recommendations without I/O", () => {
    const snapshot = assemblePortfolio(
      [TCS_HOLDING, INFY_HOLDING],
      new Map([
        [
          "TCS",
          {
            fundamentals: {
              symbol: "TCS",
              peRatio: 12,
              roe: 22,
              debtToEquity: 0.2,
              revenueGrowth: 15,
            },
            dailyCloses: Array.from({ length: 50 }, (_, i) => ({ close: 3500 + i })),
          },
        ],
      ]),
    );
    expect(snapshot.total).toBe(43500);
    expect(snapshot.holdings).toHaveLength(2);
    expect(["BUY_MORE", "HOLD", "SELL"]).toContain(snapshot.holdings[0]?.recommendation.action);
  });
});
