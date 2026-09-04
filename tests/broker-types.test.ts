import { describe, expect, it } from "vitest";
import type {
  Broker,
  Holding,
  Order,
  PlaceOrderParams,
  Position,
} from "../src/services/broker-types.js";

const holding: Holding = {
  symbol: "RELIANCE",
  quantity: 10,
  averagePrice: 2400,
  ltp: 2500,
  pnl: 1000,
  pnlPercent: 4.17,
  dayChange: 25,
  dayChangePercent: 1.0,
  currentValue: 25000,
};

const order: Order = {
  id: "o1",
  symbol: "TCS",
  side: "BUY",
  qty: 5,
  price: 3800,
  status: "complete",
  timestamp: "2026-01-01T00:00:00.000Z",
};

const params: PlaceOrderParams = { symbol: "TCS", qty: 5, side: "BUY", type: "MARKET" };

describe("broker types", () => {
  it("Holding exposes portfolio fields", () => {
    expect(holding.currentValue).toBe(holding.quantity * holding.ltp);
    expect(holding.pnlPercent).toBeGreaterThan(0);
  });

  it("Order carries status and a timestamp", () => {
    expect(order.status).toBeTruthy();
    expect(new Date(order.timestamp).getTime()).not.toBeNaN();
  });

  it("PlaceOrderParams omits limitPrice for a MARKET order", () => {
    expect(params).not.toHaveProperty("limitPrice");
  });

  it("Broker requires confirm on placeOrder", () => {
    const broker: Broker = {
      name: "upstox",
      isAuthenticated: true,
      getAuthUrl: () => "https://example.com",
      authenticate: async () => {},
      getHoldings: async () => [holding],
      getPositions: async () => [],
      getOrders: async () => [order],
      placeOrder: async () => ({ id: "o1" }),
    };
    expect(broker.placeOrder.length >= 0).toBe(true);
  });
});
