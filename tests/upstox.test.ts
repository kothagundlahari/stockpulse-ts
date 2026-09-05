import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpstoxClient } from "../src/services/upstox.js";

describe("UpstoxClient", () => {
  let client: UpstoxClient;
  const authHeader = { Authorization: "Bearer tok" };

  beforeEach(() => {
    client = new UpstoxClient({
      apiKey: "k",
      apiSecret: "s",
      redirectUri: "http://localhost:8787/callback",
      accessToken: "tok",
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("getAuthUrl builds an authorization URL", () => {
    expect(client.getAuthUrl()).toContain("api.upstox.com");
  });

  it("getHoldings parses Upstox holdings", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({
      data: {
        data: [
          {
            tradingsymbol: "RELIANCE",
            quantity: 10,
            average_price: 2400,
            close_price: 2500,
            pnl: 1000,
            pnl_percent: 4.17,
            day_change: 25,
            day_change_percent: 1,
            current_value: 25000,
          },
        ],
      },
    });
    const holdings = await client.getHoldings();
    expect(holdings[0].symbol).toBe("RELIANCE");
    expect(holdings[0].currentValue).toBe(25000);
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining("long-term-holdings"),
      expect.objectContaining({ headers: authHeader }),
    );
  });

  it("getOrders maps Upstox order rows", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({
      data: {
        data: [
          {
            order_id: "o1",
            tradingsymbol: "TCS",
            transaction_type: "BUY",
            quantity: 5,
            price: 3800,
            status: "complete",
            order_timestamp: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });
    const orders = await client.getOrders();
    expect(orders[0]).toMatchObject({
      id: "o1",
      symbol: "TCS",
      side: "BUY",
      qty: 5,
      status: "complete",
    });
  });

  it("placeOrder rejects an order when confirm is false", async () => {
    const post = vi.spyOn(axios, "post").mockResolvedValue({ data: { data: { order_id: "o9" } } });
    await expect(
      client.placeOrder({ symbol: "TCS", qty: 5, side: "BUY", type: "MARKET", confirm: false }),
    ).rejects.toThrow("confirm");
    expect(post).not.toHaveBeenCalled();
  });

  it("placeOrder posts to /order/place when confirmed", async () => {
    vi.spyOn(axios, "post").mockResolvedValue({ data: { data: { order_id: "o9" } } });
    vi.spyOn(axios, "get").mockResolvedValue({
      data: {
        data: [
          {
            instrument_key: "NSE_EQ|INE002A01018",
            trading_symbol: "RELIANCE",
            exchange: "NSE",
            segment: "NSE_EQ",
            instrument_type: "EQ",
          },
        ],
      },
    });
    const result = await client.placeOrder({
      symbol: "RELIANCE",
      qty: 5,
      side: "BUY",
      type: "MARKET",
      confirm: true,
    });
    expect(result.id).toBe("o9");
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining("instruments/search/RELIANCE"),
      expect.objectContaining({ headers: authHeader }),
    );
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("order/place"),
      expect.objectContaining({ instrument_token: "NSE_EQ|INE002A01018" }),
      expect.objectContaining({ headers: authHeader }),
    );
  });

  it("placeOrder throws when instrument key cannot be resolved", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({ data: { data: [] } });
    await expect(
      client.placeOrder({ symbol: "UNKNOWN", qty: 1, side: "BUY", type: "MARKET", confirm: true }),
    ).rejects.toThrow(/instrument/i);
  });

  it("getAuthUrl includes the state parameter when provided", () => {
    const url = client.getAuthUrl("abc123");
    expect(url).toContain("state=abc123");
  });

  it("getAuthUrl omits state when undefined", () => {
    expect(client.getAuthUrl()).not.toContain("state=");
  });
});
