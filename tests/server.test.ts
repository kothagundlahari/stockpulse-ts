import type http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";
import type { Broker } from "../src/services/broker-types.js";
import type { YahooFinanceService } from "../src/services/yahoo-finance.js";

let server: http.Server;
let base = "";

beforeAll(async () => {
  server = await createServer({ port: 0, realBroker: false });
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 8787}`;
});

afterAll(() => server.close());

describe("HTTP API", () => {
  it("GET /api/broker reports auth state without a real client", async () => {
    const res = await fetch(`${base}/api/broker`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.authenticated).toBe("boolean");
  });

  it("POST /api/trade rejects missing confirm", async () => {
    const res = await fetch(`${base}/api/trade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: "TCS", side: "BUY", qty: 5, type: "MARKET" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/confirm/i);
  });

  it("POST /api/trade with valid params and confirm: true succeeds and returns { id: string }", async () => {
    const res = await fetch(`${base}/api/trade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: "TCS",
        side: "BUY",
        qty: 10,
        type: "MARKET",
        confirm: true,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.id).toBe("string");
    expect(body.id).toBe("mock-order");
  });

  it("POST /api/trade with valid LIMIT order and limitPrice succeeds", async () => {
    const res = await fetch(`${base}/api/trade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: "TCS",
        side: "SELL",
        qty: 5,
        type: "LIMIT",
        limitPrice: 3500,
        confirm: true,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.id).toBe("string");
    expect(body.id).toBe("mock-order");
  });

  it("POST /api/trade with invalid side or type or missing limitPrice for LIMIT rejects with 400", async () => {
    // invalid side
    const resSide = await fetch(`${base}/api/trade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: "TCS",
        side: "HOLD",
        qty: 5,
        type: "MARKET",
        confirm: true,
      }),
    });
    expect(resSide.status).toBe(400);
    const bodySide = await resSide.json();
    expect(bodySide.error).toMatch(/side/i);

    // invalid type
    const resType = await fetch(`${base}/api/trade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: "TCS",
        side: "BUY",
        qty: 5,
        type: "STOP",
        confirm: true,
      }),
    });
    expect(resType.status).toBe(400);
    const bodyType = await resType.json();
    expect(bodyType.error).toMatch(/type/i);

    // invalid qty (non-integer, <= 0)
    const resQty = await fetch(`${base}/api/trade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: "TCS",
        side: "BUY",
        qty: -2,
        type: "MARKET",
        confirm: true,
      }),
    });
    expect(resQty.status).toBe(400);
    const bodyQty = await resQty.json();
    expect(bodyQty.error).toMatch(/qty/i);

    // missing limitPrice for LIMIT
    const resLimit1 = await fetch(`${base}/api/trade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: "TCS",
        side: "BUY",
        qty: 5,
        type: "LIMIT",
        confirm: true,
      }),
    });
    expect(resLimit1.status).toBe(400);
    const bodyLimit1 = await resLimit1.json();
    expect(bodyLimit1.error).toMatch(/limitPrice/i);

    // non-positive limitPrice for LIMIT
    const resLimit2 = await fetch(`${base}/api/trade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: "TCS",
        side: "BUY",
        qty: 5,
        type: "LIMIT",
        limitPrice: -50,
        confirm: true,
      }),
    });
    expect(resLimit2.status).toBe(400);
    const bodyLimit2 = await resLimit2.json();
    expect(bodyLimit2.error).toMatch(/limitPrice/i);
  });

  it("handles null or primitive JSON request bodies gracefully without throwing", async () => {
    const res = await fetch(`${base}/api/trade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "null",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/confirm/i);
  });

  it("GET /api/screen validates criteria and returns an array", async () => {
    const res = await fetch(`${base}/api/screen?minPe=10&maxPe=20`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.stocks)).toBe(true);
  });

  it("GET /api/screen parses minRevenueGrowth parameter", async () => {
    const res = await fetch(`${base}/api/screen?minRevenueGrowth=15`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.stocks)).toBe(true);
  });

  it("GET /api/ai returns available status", async () => {
    const res = await fetch(`${base}/api/ai`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.available).toBe("boolean");
  });

  it("GET /api/portfolio returns holdings list", async () => {
    const res = await fetch(`${base}/api/portfolio`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.holdings)).toBe(true);
    expect(typeof body.total).toBe("number");
  });

  it("GET /api/portfolio with non-empty holdings array confirms enrichment", async () => {
    const customServer = await createServer({
      port: 0,
      realBroker: false,
      deps: {
        upstox: {
          name: "upstox",
          isAuthenticated: true,
          getAuthUrl: () => "https://api.upstox.com/v2/login/authorization/dialog",
          authenticate: async () => {},
          getHoldings: async () => [
            {
              symbol: "INFY",
              quantity: 10,
              averagePrice: 1400,
              ltp: 1500,
              pnl: 1000,
              pnlPercent: 7.14,
              dayChange: 20,
              dayChangePercent: 1.35,
              currentValue: 15000,
            },
          ],
          getPositions: async () => [],
          getOrders: async () => [],
          placeOrder: async () => ({ id: "mock-order" }),
        },
        yahoo: {
          getFundamentals: async (s: string) => ({
            symbol: s,
            peRatio: 25,
            pbRatio: 5,
            dividendYield: 1.2,
            roe: 22,
            debtToEquity: 0.1,
            marketCap: 600000,
          }),
          getHistoricalPrices: async () => [
            { date: "2025-01-01", open: 1400, high: 1450, low: 1390, close: 1420, volume: 1000 },
            { date: "2025-01-02", open: 1420, high: 1480, low: 1410, close: 1470, volume: 1000 },
          ],
        } as unknown as YahooFinanceService,
      },
    });
    await new Promise<void>((resolve) => customServer.listen(0, () => resolve()));
    const addr = customServer.address();
    const customBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 8787}`;

    try {
      const res = await fetch(`${customBase}/api/portfolio`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.total).toBe(15000);
      expect(body.holdings).toHaveLength(1);
      const holding = body.holdings[0];
      expect(holding.symbol).toBe("INFY");
      expect(holding.recommendation).toBeDefined();
      expect(["BUY_MORE", "HOLD", "SELL"]).toContain(holding.recommendation.action);
      expect(["low", "medium", "high"]).toContain(holding.recommendation.confidence);
      expect(Array.isArray(holding.recommendation.reasons)).toBe(true);
    } finally {
      customServer.close();
    }
  });

  it("GET /api/orders returns orders array", async () => {
    const res = await fetch(`${base}/api/orders`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.orders)).toBe(true);
  });

  it("POST /api/broker/auth rejects missing code", async () => {
    const res = await fetch(`${base}/api/broker/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/broker/auth with valid code succeeds and updates deps.upstox", async () => {
    const authenticatedClient: Broker = {
      name: "upstox",
      isAuthenticated: true,
      getAuthUrl: () => "https://api.upstox.com/v2/login/authorization/dialog",
      authenticate: async () => {},
      getHoldings: async () => [],
      getPositions: async () => [],
      getOrders: async () => [],
      placeOrder: async () => ({ id: "mock-order" }),
    };

    const customServer = await createServer({
      port: 0,
      realBroker: false,
      deps: {
        connectUpstox: async (code: string) => {
          if (code === "valid-code") return authenticatedClient;
          throw new Error("Invalid code");
        },
      },
    });
    await new Promise<void>((resolve) => customServer.listen(0, () => resolve()));
    const addr = customServer.address();
    const customBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 8787}`;

    try {
      // Prior to auth, broker is unauthenticated
      const beforeRes = await fetch(`${customBase}/api/broker`);
      const beforeBody = await beforeRes.json();
      expect(beforeBody.authenticated).toBe(false);

      // Authenticate
      const authRes = await fetch(`${customBase}/api/broker/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "valid-code" }),
      });
      expect(authRes.status).toBe(200);
      const authBody = await authRes.json();
      expect(authBody.ok).toBe(true);

      // After auth, GET /api/broker reflects updated authenticated client
      const afterRes = await fetch(`${customBase}/api/broker`);
      const afterBody = await afterRes.json();
      expect(afterBody.authenticated).toBe(true);
    } finally {
      customServer.close();
    }
  });
});
