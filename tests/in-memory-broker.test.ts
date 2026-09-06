import { describe, expect, it } from "vitest";
import { createInMemoryBroker, InMemoryBroker } from "../src/services/in-memory-broker.js";

describe("InMemoryBroker", () => {
  it("initializes with default options and supports authentication simulation", async () => {
    const broker = createInMemoryBroker();
    expect(broker.name).toBe("in-memory");
    expect(broker.isAuthenticated).toBe(true);

    const authUrl = broker.getAuthUrl("custom-state");
    expect(authUrl).toContain("custom-state");

    broker.simulateSessionExpiration();
    expect(broker.isAuthenticated).toBe(false);

    await expect(broker.getHoldings()).rejects.toThrow(/Not authenticated/);
    await expect(broker.getPositions()).rejects.toThrow(/Not authenticated/);
    await expect(broker.getOrders()).rejects.toThrow(/Not authenticated/);

    await broker.authenticate("test-auth-code");
    expect(broker.isAuthenticated).toBe(true);

    await expect(broker.authenticate("")).rejects.toThrow(/Invalid authorization code/);
  });

  it("retrieves seeded holdings, positions, and orders", async () => {
    const broker = new InMemoryBroker({
      holdings: [
        {
          symbol: "TCS",
          quantity: 10,
          averagePrice: 3500,
          ltp: 3600,
          pnl: 1000,
          pnlPercent: 2.85,
          dayChange: 20,
          dayChangePercent: 0.55,
          currentValue: 36000,
        },
      ],
      positions: [
        {
          symbol: "INFY",
          quantity: 5,
          averagePrice: 1500,
          ltp: 1520,
          pnl: 100,
        },
      ],
      orders: [
        {
          id: "ord-prev-1",
          symbol: "TCS",
          side: "BUY",
          qty: 10,
          price: 3500,
          status: "COMPLETE",
          timestamp: "2026-09-01T10:00:00.000Z",
        },
      ],
    });

    const holdings = await broker.getHoldings();
    expect(holdings).toHaveLength(1);
    expect(holdings[0]?.symbol).toBe("TCS");

    const positions = await broker.getPositions();
    expect(positions).toHaveLength(1);
    expect(positions[0]?.symbol).toBe("INFY");

    const orders = await broker.getOrders();
    expect(orders).toHaveLength(1);
    expect(orders[0]?.id).toBe("ord-prev-1");
  });

  it("enforces ADR-0001 confirmation gate on order placement", async () => {
    const broker = createInMemoryBroker();
    const untypedBroker = broker as unknown as {
      placeOrder: (params: unknown) => Promise<{ id: string }>;
    };

    await expect(
      untypedBroker.placeOrder({ symbol: "INFY", qty: 5, side: "BUY", type: "MARKET" }),
    ).rejects.toThrow(/Order not confirmed/);

    await expect(
      untypedBroker.placeOrder({
        symbol: "INFY",
        qty: 5,
        side: "BUY",
        type: "MARKET",
        confirm: false,
      }),
    ).rejects.toThrow(/Order not confirmed/);
  });

  it("validates symbol and quantity when placing orders", async () => {
    const broker = createInMemoryBroker();

    await expect(
      broker.placeOrder({ symbol: "", qty: 10, side: "BUY", type: "MARKET", confirm: true }),
    ).rejects.toThrow(/Invalid symbol/);

    await expect(
      broker.placeOrder({ symbol: "INFY", qty: 0, side: "BUY", type: "MARKET", confirm: true }),
    ).rejects.toThrow(/positive integer/);

    await expect(
      broker.placeOrder({ symbol: "INFY", qty: -5, side: "BUY", type: "MARKET", confirm: true }),
    ).rejects.toThrow(/positive integer/);
  });

  it("places BUY orders and deterministically updates holdings and orders", async () => {
    const broker = createInMemoryBroker();

    // Buy new holding
    const res1 = await broker.placeOrder({
      symbol: "RELIANCE",
      qty: 10,
      side: "BUY",
      type: "LIMIT",
      limitPrice: 2500,
      confirm: true,
    });
    expect(res1.id).toBeDefined();

    let holdings = await broker.getHoldings();
    expect(holdings).toHaveLength(1);
    expect(holdings[0]?.symbol).toBe("RELIANCE");
    expect(holdings[0]?.quantity).toBe(10);
    expect(holdings[0]?.averagePrice).toBe(2500);

    // Buy more of existing holding at higher price
    const res2 = await broker.placeOrder({
      symbol: "RELIANCE",
      qty: 10,
      side: "BUY",
      type: "LIMIT",
      limitPrice: 2700,
      confirm: true,
    });
    expect(res2.id).toBeDefined();

    holdings = await broker.getHoldings();
    expect(holdings).toHaveLength(1);
    expect(holdings[0]?.quantity).toBe(20);
    expect(holdings[0]?.averagePrice).toBe(2600); // (10*2500 + 10*2700) / 20 = 2600

    const orders = await broker.getOrders();
    expect(orders).toHaveLength(2);
    expect(orders[0]?.id).toBe(res1.id);
    expect(orders[1]?.id).toBe(res2.id);
  });

  it("places SELL orders and reduces or removes holdings", async () => {
    const broker = createInMemoryBroker({
      holdings: [
        {
          symbol: "WIPRO",
          quantity: 20,
          averagePrice: 400,
          ltp: 450,
          pnl: 1000,
          pnlPercent: 12.5,
          dayChange: 5,
          dayChangePercent: 1.1,
          currentValue: 9000,
        },
      ],
    });

    // Partial sell
    await broker.placeOrder({
      symbol: "WIPRO",
      qty: 5,
      side: "SELL",
      type: "MARKET",
      confirm: true,
    });

    let holdings = await broker.getHoldings();
    expect(holdings).toHaveLength(1);
    expect(holdings[0]?.quantity).toBe(15);

    // Complete sell of remaining
    await broker.placeOrder({
      symbol: "WIPRO",
      qty: 15,
      side: "SELL",
      type: "MARKET",
      confirm: true,
    });

    holdings = await broker.getHoldings();
    expect(holdings).toHaveLength(0);
  });

  it("does not open or mutate Positions when placing a confirmed Order", async () => {
    const seededPosition = {
      symbol: "INFY",
      quantity: 5,
      averagePrice: 1500,
      ltp: 1520,
      pnl: 100,
    };
    const broker = createInMemoryBroker({
      positions: [seededPosition],
    });

    await broker.placeOrder({
      symbol: "INFY",
      qty: 5,
      side: "BUY",
      type: "MARKET",
      confirm: true,
    });

    const holdings = await broker.getHoldings();
    expect(holdings).toHaveLength(1);
    expect(holdings[0]?.symbol).toBe("INFY");
    expect(holdings[0]?.quantity).toBe(5);

    const positions = await broker.getPositions();
    expect(positions).toEqual([seededPosition]);
  });
});
