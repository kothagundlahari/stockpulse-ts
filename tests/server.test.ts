import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { signConnectCsrf } from "../src/oauth-state-cookie.js";
import { createServer } from "../src/server.js";
import type { Broker } from "../src/services/broker-types.js";
import { DatabaseService } from "../src/services/database.js";
import type { YahooFinanceService } from "../src/services/yahoo-finance.js";

// res.json() yields `unknown`; narrow to a record so tests can read fields without `any`.
async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function expectCriteriaFundamentals(body: Record<string, unknown>): void {
  expect(Array.isArray(body.fundamentals)).toBe(true);
  expect(body.stocks).toBeUndefined();
}

let server: http.Server;
let base = "";

function oauthStateCookieHeader(state: string): string {
  return `sp_oauth_state=${signConnectCsrf(state)}`;
}

function getUnauthenticatedBroker(): Broker {
  return {
    name: "upstox",
    isAuthenticated: false,
    getAuthUrl: () => "https://api.upstox.com/v2/login/authorization/dialog",
    authenticate: () => Promise.resolve(),
    getHoldings: () => Promise.resolve([]),
    getPositions: () => Promise.resolve([]),
    getOrders: () => Promise.resolve([]),
    placeOrder: async () => ({ id: "mock-order" }),
  };
}

function getAuthenticatedBroker(): Broker {
  return {
    ...getUnauthenticatedBroker(),
    isAuthenticated: true,
  };
}

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
    const body = await readJson(res);
    expect(typeof body.authenticated).toBe("boolean");
  });

  it("GET /api/journal is removed", async () => {
    const res = await fetch(`${base}/api/journal`);
    expect(res.status).toBe(404);
  });

  it("POST /api/trade rejects missing confirm", async () => {
    const res = await fetch(`${base}/api/trade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: "TCS", side: "BUY", qty: 5, type: "MARKET" }),
    });
    expect(res.status).toBe(400);
    const body = await readJson(res);
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
    const body = await readJson(res);
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
    const body = await readJson(res);
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
    const bodySide = await readJson(resSide);
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
    const bodyType = await readJson(resType);
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
    const bodyQty = await readJson(resQty);
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
    const bodyLimit1 = await readJson(resLimit1);
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
    const bodyLimit2 = await readJson(resLimit2);
    expect(bodyLimit2.error).toMatch(/limitPrice/i);
  });

  it("handles null or primitive JSON request bodies gracefully without throwing", async () => {
    const res = await fetch(`${base}/api/trade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "null",
    });
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.error).toMatch(/confirm/i);
  });

  it("GET /api/screen validates criteria and returns an array", async () => {
    const res = await fetch(`${base}/api/screen?minPe=10&maxPe=20`);
    expect(res.status).toBe(200);
    expectCriteriaFundamentals(await readJson(res));
  });

  it("GET /api/screener aliases /api/screen", async () => {
    const res = await fetch(`${base}/api/screener?minPe=10&maxPe=20`);
    expect(res.status).toBe(200);
    expectCriteriaFundamentals(await readJson(res));
  });

  it("GET /api/screen parses minRevenueGrowth parameter", async () => {
    const res = await fetch(`${base}/api/screen?minRevenueGrowth=15`);
    expect(res.status).toBe(200);
    expectCriteriaFundamentals(await readJson(res));
  });

  it("GET /api/ai returns available status", async () => {
    const res = await fetch(`${base}/api/ai`);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(typeof body.available).toBe("boolean");
  });

  it("GET /api/portfolio returns holdings list", async () => {
    const res = await fetch(`${base}/api/portfolio`);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(Array.isArray(body.holdings)).toBe(true);
    expect(typeof body.total).toBe("number");
  });

  it("GET /api/portfolio with non-empty holdings array confirms enrichment", async () => {
    const customServer = await createServer({
      port: 0,
      realBroker: false,
      deps: {
        broker: {
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
      const body = (await readJson(res)) as {
        total: number;
        holdings: Array<{ symbol: unknown; recommendation: Record<string, unknown> }>;
      };
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

  it("GET /api/portfolio uses cached fundamentals from deps.db", async () => {
    const testDbPath = "./data/test-server-portfolio-cache.db";
    const db = new DatabaseService(testDbPath);
    db.saveFundamentals([{ symbol: "TCS", peRatio: 28, marketCap: 1200000, roe: 35 }]);

    const mockYahoo = {
      getFundamentals: vi.fn(),
      getHistoricalPrices: vi
        .fn()
        .mockResolvedValue([
          { date: "2025-01-01", open: 3400, high: 3450, low: 3390, close: 3420, volume: 1000 },
        ]),
    };

    const customServer = await createServer({
      port: 0,
      realBroker: false,
      deps: {
        db,
        broker: {
          name: "upstox",
          isAuthenticated: true,
          getAuthUrl: () => "",
          authenticate: async () => {},
          getHoldings: async () => [
            {
              symbol: "TCS",
              quantity: 5,
              averagePrice: 3400,
              ltp: 3500,
              pnl: 500,
              pnlPercent: 2.94,
              dayChange: 50,
              dayChangePercent: 1.45,
              currentValue: 17500,
            },
          ],
          getPositions: async () => [],
          getOrders: async () => [],
          placeOrder: async () => ({ id: "mock-order" }),
        },
        yahoo: mockYahoo as unknown as YahooFinanceService,
      },
    });

    await new Promise<void>((resolve) => customServer.listen(0, () => resolve()));
    const addr = customServer.address();
    const customBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 8787}`;

    try {
      const res = await fetch(`${customBase}/api/portfolio`);
      expect(res.status).toBe(200);
      const body = (await readJson(res)) as {
        holdings: Array<{ symbol: unknown; recommendation: Record<string, unknown> }>;
      };
      expect(body.holdings[0].symbol).toBe("TCS");
      expect(body.holdings[0].recommendation).toBeDefined();
      expect(mockYahoo.getFundamentals).not.toHaveBeenCalled();
    } finally {
      customServer.close();
      db.close();
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
    }
  });

  it("GET /api/orders returns orders array", async () => {
    const res = await fetch(`${base}/api/orders`);
    expect(res.status).toBe(200);
    const body = await readJson(res);
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

  it("POST /api/broker/auth with valid code succeeds and updates deps.broker", async () => {
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
      const beforeBody = await readJson(beforeRes);
      expect(beforeBody.authenticated).toBe(false);

      // Authenticate
      const authRes = await fetch(`${customBase}/api/broker/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "valid-code" }),
      });
      expect(authRes.status).toBe(200);
      const authBody = await readJson(authRes);
      expect(authBody.ok).toBe(true);

      // After auth, GET /api/broker reflects updated authenticated client
      const afterRes = await fetch(`${customBase}/api/broker`);
      const afterBody = await readJson(afterRes);
      expect(afterBody.authenticated).toBe(true);
    } finally {
      customServer.close();
    }
  });

  it("GET /callback with code connects upstox and redirects to /?broker=connected", async () => {
    let connectedCode = "";
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
          connectedCode = code;
          return authenticatedClient;
        },
      },
    });
    await new Promise<void>((resolve) => customServer.listen(0, () => resolve()));
    const addr = customServer.address();
    const customBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 8787}`;

    try {
      const res = await fetch(`${customBase}/callback?code=test-auth-code&state=test-state`, {
        redirect: "manual",
        headers: { cookie: oauthStateCookieHeader("test-state") },
      });
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/?broker=connected");
      expect(connectedCode).toBe("test-auth-code");

      const brokerRes = await fetch(`${customBase}/api/broker`);
      const brokerBody = await readJson(brokerRes);
      expect(brokerBody.authenticated).toBe(true);
    } finally {
      customServer.close();
    }
  });

  it("GET /callback with error redirects to /?broker=error", async () => {
    const res = await fetch(`${base}/callback?error=access_denied&state=test-state`, {
      redirect: "manual",
      headers: { cookie: oauthStateCookieHeader("test-state") },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      `/?broker=error&message=${encodeURIComponent("access_denied")}`,
    );
  });

  it("GET /callback without code redirects to /?broker=error", async () => {
    const res = await fetch(`${base}/callback?state=test-state`, {
      redirect: "manual",
      headers: { cookie: oauthStateCookieHeader("test-state") },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      `/?broker=error&message=${encodeURIComponent("Missing authorization code")}`,
    );
  });

  it("GET /callback redirects to /?broker=error when connectUpstox fails", async () => {
    const failingServer = await createServer({
      port: 0,
      realBroker: false,
      deps: {
        connectUpstox: async () => {
          throw new Error("Token exchange failed");
        },
      },
    });
    await new Promise<void>((resolve) => failingServer.listen(0, () => resolve()));
    const addr = failingServer.address();
    const customBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 8787}`;

    try {
      const res = await fetch(`${customBase}/callback?code=bad-code&state=test-state`, {
        redirect: "manual",
        headers: { cookie: oauthStateCookieHeader("test-state") },
      });
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(
        `/?broker=error&message=${encodeURIComponent("Token exchange failed")}`,
      );
    } finally {
      failingServer.close();
    }
  });

  it("POST /api/broker/disconnect clears broker auth", async () => {
    let disconnected = false;
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
        broker: authenticatedClient,
        disconnectUpstox: () => {
          disconnected = true;
        },
      },
    });
    await new Promise<void>((resolve) => customServer.listen(0, () => resolve()));
    const addr = customServer.address();
    const customBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 8787}`;

    try {
      const beforeRes = await fetch(`${customBase}/api/broker`);
      const beforeBody = await readJson(beforeRes);
      expect(beforeBody.authenticated).toBe(true);

      const disRes = await fetch(`${customBase}/api/broker/disconnect`, {
        method: "POST",
      });
      expect(disRes.status).toBe(200);
      const disBody = await readJson(disRes);
      expect(disBody.ok).toBe(true);
      expect(disconnected).toBe(true);

      const afterRes = await fetch(`${customBase}/api/broker`);
      const afterBody = await readJson(afterRes);
      expect(afterBody.authenticated).toBe(false);
    } finally {
      customServer.close();
    }
  });

  it("GET /api/portfolio returns 401 and clears session when Upstox returns 401", async () => {
    let disconnected = false;
    const authError = Object.assign(new Error("Request failed with status code 401"), {
      response: { status: 401 },
    });
    const authenticatedClient: Broker = {
      name: "upstox",
      isAuthenticated: true,
      getAuthUrl: () => "https://api.upstox.com/v2/login/authorization/dialog",
      authenticate: async () => {},
      getHoldings: async () => {
        throw authError;
      },
      getPositions: async () => [],
      getOrders: async () => [],
      placeOrder: async () => ({ id: "mock-order" }),
    };

    const customServer = await createServer({
      port: 0,
      realBroker: false,
      deps: {
        broker: authenticatedClient,
        disconnectUpstox: () => {
          disconnected = true;
        },
      },
    });
    await new Promise<void>((resolve) => customServer.listen(0, () => resolve()));
    const addr = customServer.address();
    const customBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 8787}`;

    try {
      const res = await fetch(`${customBase}/api/portfolio`);
      expect(res.status).toBe(401);
      const body = await readJson(res);
      expect(body.expired).toBe(true);
      expect(body.error).toBe("Upstox session expired. Please re-authorize.");
      expect(disconnected).toBe(true);

      const brokerRes = await fetch(`${customBase}/api/broker`);
      const brokerBody = await readJson(brokerRes);
      expect(brokerBody.authenticated).toBe(false);
    } finally {
      customServer.close();
    }
  });

  it("GET /api/orders returns 401 and clears session when Upstox returns 401", async () => {
    let disconnected = false;
    const authError = Object.assign(new Error("Request failed with status code 401"), {
      response: { status: 401 },
    });
    const authenticatedClient: Broker = {
      name: "upstox",
      isAuthenticated: true,
      getAuthUrl: () => "https://api.upstox.com/v2/login/authorization/dialog",
      authenticate: async () => {},
      getHoldings: async () => [],
      getPositions: async () => [],
      getOrders: async () => {
        throw authError;
      },
      placeOrder: async () => ({ id: "mock-order" }),
    };

    const customServer = await createServer({
      port: 0,
      realBroker: false,
      deps: {
        broker: authenticatedClient,
        disconnectUpstox: () => {
          disconnected = true;
        },
      },
    });
    await new Promise<void>((resolve) => customServer.listen(0, () => resolve()));
    const addr = customServer.address();
    const customBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 8787}`;

    try {
      const res = await fetch(`${customBase}/api/orders`);
      expect(res.status).toBe(401);
      const body = await readJson(res);
      expect(body.expired).toBe(true);
      expect(body.error).toBe("Upstox session expired. Please re-authorize.");
      expect(disconnected).toBe(true);

      const brokerRes = await fetch(`${customBase}/api/broker`);
      const brokerBody = await readJson(brokerRes);
      expect(brokerBody.authenticated).toBe(false);
    } finally {
      customServer.close();
    }
  });

  it("POST /api/trade returns 401 and clears session when Upstox returns 401", async () => {
    let disconnected = false;
    const authError = Object.assign(new Error("Request failed with status code 401"), {
      response: { status: 401 },
    });
    const authenticatedClient: Broker = {
      name: "upstox",
      isAuthenticated: true,
      getAuthUrl: () => "https://api.upstox.com/v2/login/authorization/dialog",
      authenticate: async () => {},
      getHoldings: async () => [],
      getPositions: async () => [],
      getOrders: async () => [],
      placeOrder: async () => {
        throw authError;
      },
    };

    const customServer = await createServer({
      port: 0,
      realBroker: false,
      deps: {
        broker: authenticatedClient,
        disconnectUpstox: () => {
          disconnected = true;
        },
      },
    });
    await new Promise<void>((resolve) => customServer.listen(0, () => resolve()));
    const addr = customServer.address();
    const customBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 8787}`;

    try {
      const res = await fetch(`${customBase}/api/trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: "TCS",
          side: "BUY",
          qty: 1,
          type: "MARKET",
          confirm: true,
        }),
      });
      expect(res.status).toBe(401);
      const body = await readJson(res);
      expect(body.expired).toBe(true);
      expect(body.error).toBe("Upstox session expired. Please re-authorize.");
      expect(disconnected).toBe(true);

      const brokerRes = await fetch(`${customBase}/api/broker`);
      const brokerBody = await readJson(brokerRes);
      expect(brokerBody.authenticated).toBe(false);
    } finally {
      customServer.close();
    }
  });

  it("GET /api/personalities returns all personalities with match counts", async () => {
    const res = await fetch(`${base}/api/personalities`);
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      total: number;
      personalities: Array<{ id: string; name: string; candidates: unknown[] }>;
    };
    expect(typeof body.total).toBe("number");
    expect(Array.isArray(body.personalities)).toBe(true);
    expect(body.personalities.length).toBe(8);
    expect(body.personalities[0]).toHaveProperty("id");
    expect(body.personalities[0]).toHaveProperty("name");
    expect(body.personalities[0]).toHaveProperty("candidates");
  });

  it("GET /api/personalities returns Candidates with score sorted descending", async () => {
    const res = await fetch(`${base}/api/personalities`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      personalities: Array<{ id: string; candidates: Array<{ symbol: string; score: number }> }>;
    };
    expect(body.personalities.length).toBeGreaterThan(0);
    const withCandidates = body.personalities.filter((p) => p.candidates.length > 0);
    expect(withCandidates.length).toBeGreaterThan(0);
    for (const p of body.personalities) {
      for (const s of p.candidates) {
        expect(typeof s.score).toBe("number");
      }
      if (p.candidates.length > 1) {
        for (let i = 0; i < p.candidates.length - 1; i++) {
          expect(p.candidates[i].score).toBeGreaterThanOrEqual(p.candidates[i + 1].score);
        }
      }
    }
  });

  it("GET /api/personalities/:id returns Candidates ranked descending by score", async () => {
    const customServer = await createServer({
      port: 0,
      realBroker: false,
      deps: {
        getFundamentals: async () => [
          {
            symbol: "STOCK_LOW",
            sector: "Finance",
            peRatio: 12,
            pbRatio: 1.8,
            dividendYield: 1.0,
            roe: 12,
            debtToEquity: 0.4,
            operatingMargin: 10,
          },
          {
            symbol: "STOCK_HIGH",
            sector: "Finance",
            peRatio: 5,
            pbRatio: 0.8,
            dividendYield: 4.0,
            roe: 25,
            debtToEquity: 0.0,
            operatingMargin: 25,
          },
        ],
      },
    });
    await new Promise<void>((resolve) => customServer.listen(0, () => resolve()));
    const addr = customServer.address();
    const customBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 8787}`;

    try {
      const res = await fetch(`${customBase}/api/personalities/klarman`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        id: string;
        candidates: Array<{ symbol: string; score: number }>;
      };
      expect(body.candidates.length).toBe(2);
      expect(body.candidates[0].symbol).toBe("STOCK_HIGH");
      expect(body.candidates[1].symbol).toBe("STOCK_LOW");
      expect(typeof body.candidates[0].score).toBe("number");
      expect(typeof body.candidates[1].score).toBe("number");
      expect(body.candidates[0].score).toBeGreaterThan(body.candidates[1].score);
    } finally {
      customServer.close();
    }
  });

  it("GET /api/personalities/:id returns a single personality or 404", async () => {
    const res = await fetch(`${base}/api/personalities/buffett`);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.id).toBe("buffett");
    expect(Array.isArray(body.candidates)).toBe(true);

    const notFound = await fetch(`${base}/api/personalities/unknown-id`);
    expect(notFound.status).toBe(404);
  });

  it("GET /api/personalities handles getFundamentals failure gracefully", async () => {
    const failingServer = await createServer({
      port: 0,
      realBroker: false,
      deps: {
        getFundamentals: async () => {
          throw new Error("Data fetch error");
        },
      },
    });
    await new Promise<void>((resolve) => failingServer.listen(0, () => resolve()));
    const addr = failingServer.address();
    const customBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 8787}`;

    try {
      const res = await fetch(`${customBase}/api/personalities`);
      expect(res.status).toBe(500);
      const body = await readJson(res);
      expect(body.error).toBe("Internal server error");
      expect(Array.isArray(body.personalities)).toBe(true);
      expect(body.personalities).toHaveLength(0);
    } finally {
      failingServer.close();
    }
  });
});

describe("SSRF symbol restriction", () => {
  it("rejects invalid symbols on /api/quote, /api/news, and /api/trade with 400", async () => {
    const getQuote = vi.fn();
    const customServer = await createServer({
      port: 0,
      realBroker: false,
      deps: {
        yahoo: {
          getQuote,
          getHistoricalPrices: async () => [],
          getFundamentals: vi.fn(),
        } as unknown as YahooFinanceService,
      },
    });
    await new Promise<void>((resolve) => customServer.listen(0, () => resolve()));
    const addr = customServer.address();
    const customBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 8787}`;

    try {
      const quoteBad = await fetch(
        `${customBase}/api/quote?symbol=${encodeURIComponent("../../../etc")}`,
      );
      expect(quoteBad.status).toBe(400);
      const quoteBadBody = await readJson(quoteBad);
      expect(quoteBadBody.error).toMatch(/symbol/i);
      expect(getQuote).not.toHaveBeenCalled();

      const newsBad = await fetch(
        `${customBase}/api/news?symbol=${encodeURIComponent("<script>")}`,
      );
      expect(newsBad.status).toBe(400);

      const tradeBad = await fetch(`${customBase}/api/trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: "../../etc",
          side: "BUY",
          qty: 1,
          type: "MARKET",
          confirm: true,
        }),
      });
      expect(tradeBad.status).toBe(400);
    } finally {
      customServer.close();
    }
  });

  it("accepts a valid uppercase symbol on /api/quote", async () => {
    const getQuote = vi.fn().mockResolvedValue({
      symbol: "RELIANCE",
      ltp: 2500,
      change: 5,
      changePercent: 0.2,
      open: 2480,
      high: 2510,
      low: 2470,
      previousClose: 2495,
      volume: 100000,
      timestamp: "2026-09-05T00:00:00.000Z",
    });
    const customServer = await createServer({
      port: 0,
      realBroker: false,
      deps: {
        yahoo: {
          getQuote,
          getHistoricalPrices: async () => [],
          getFundamentals: vi.fn(),
        } as unknown as YahooFinanceService,
      },
    });
    await new Promise<void>((resolve) => customServer.listen(0, () => resolve()));
    const addr = customServer.address();
    const customBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 8787}`;

    try {
      const res = await fetch(`${customBase}/api/quote?symbol=RELIANCE`);
      expect(res.status).toBe(200);
      expect(getQuote).toHaveBeenCalledWith("RELIANCE");
    } finally {
      customServer.close();
    }
  });
});

describe("OAuth callback state protection", () => {
  it("GET /api/broker sets a state cookie and includes state in the body when unauthenticated", async () => {
    const res = await fetch(`${base}/api/broker`);
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("sp_oauth_state=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Max-Age=600");
    const body = (await res.json()) as { state?: string; authUrl: string };
    expect(typeof body.state).toBe("string");
    expect(body.authUrl).toContain(`state=${body.state}`);
    const cookieVal = /sp_oauth_state=([^;]+)/.exec(setCookie)?.[1];
    expect(cookieVal).toBeDefined();
    expect(cookieVal).not.toBe(body.state);
  });

  it("GET /callback without a state returns 403 without exchanging a code", async () => {
    let connected = false;
    const customServer = await createServer({
      port: 0,
      realBroker: false,
      deps: {
        connectUpstox: async () => {
          connected = true;
          return getUnauthenticatedBroker();
        },
      },
    });
    await new Promise<void>((resolve) => customServer.listen(0, () => resolve()));
    const addr = customServer.address();
    const customBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 8787}`;

    try {
      const res = await fetch(`${customBase}/callback?code=attacker-code`, {
        redirect: "manual",
      });
      expect(res.status).toBe(403);
      const body = await readJson(res);
      expect(body.error).toMatch(/state/i);
      expect(connected).toBe(false);
      expect(res.headers.get("set-cookie") ?? "").toContain("Max-Age=0");
    } finally {
      customServer.close();
    }
  });

  it("GET /callback with a mismatched state returns 403 without exchanging a code", async () => {
    let connected = false;
    const customServer = await createServer({
      port: 0,
      realBroker: false,
      deps: {
        connectUpstox: async () => {
          connected = true;
          return getUnauthenticatedBroker();
        },
      },
    });
    await new Promise<void>((resolve) => customServer.listen(0, () => resolve()));
    const addr = customServer.address();
    const customBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 8787}`;

    try {
      const res = await fetch(`${customBase}/callback?code=attacker-code&state=wrong`, {
        redirect: "manual",
        headers: { cookie: oauthStateCookieHeader("expected") },
      });
      expect(res.status).toBe(403);
      expect(connected).toBe(false);
      expect(res.headers.get("set-cookie") ?? "").toContain("Max-Age=0");
    } finally {
      customServer.close();
    }
  });

  it("GET /callback with matching state and cookie connects and redirects", async () => {
    let connectedCode = "";
    const customServer = await createServer({
      port: 0,
      realBroker: false,
      deps: {
        connectUpstox: async (code: string) => {
          connectedCode = code;
          return getAuthenticatedBroker();
        },
      },
    });
    await new Promise<void>((resolve) => customServer.listen(0, () => resolve()));
    const addr = customServer.address();
    const customBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 8787}`;

    try {
      const res = await fetch(`${customBase}/callback?code=good-code&state=abc`, {
        redirect: "manual",
        headers: { cookie: oauthStateCookieHeader("abc") },
      });
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/?broker=connected");
      expect(connectedCode).toBe("good-code");
      const setCookie = res.headers.get("set-cookie") ?? "";
      expect(setCookie).toContain("Max-Age=0");
      expect(setCookie).toMatch(/^sp_oauth_state=;/);
    } finally {
      customServer.close();
    }
  });
});

describe("HTTP security headers", () => {
  it("applies security headers on API responses", async () => {
    const res = await fetch(`${base}/api/broker`);
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(res.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("applies security headers on static assets", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("rejects symlink escape from public/ with 403", async () => {
    const port = Number(new URL(base).port);
    const linkPath = path.join(process.cwd(), "public", "__sec-hardening-symlink__");
    fs.rmSync(linkPath, { force: true });
    fs.symlinkSync("/etc/passwd", linkPath);
    try {
      const rawGet = (pathname: string): Promise<http.IncomingMessage> =>
        new Promise((resolve, reject) => {
          const req = http.get({ host: "127.0.0.1", port, path: pathname }, (res) => resolve(res));
          req.on("error", reject);
        });
      const res = await rawGet("/__sec-hardening-symlink__");
      expect(res.statusCode).toBe(403);
      res.destroy();
    } finally {
      fs.rmSync(linkPath, { force: true });
    }
  });
});

describe("request body cap", () => {
  it("POST /api/trade with a body larger than 100KB returns 413", async () => {
    const big = {
      symbol: "A".repeat(100 * 1024),
      side: "BUY",
      qty: 1,
      type: "MARKET",
      confirm: true,
    };
    const res = await fetch(`${base}/api/trade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(big),
    });
    expect(res.status).toBe(413);
    const body = await readJson(res);
    expect(body.error).toMatch(/large|exceeds/i);
  });

  it("POST /api/trade aborts an oversized chunked body with 413", async () => {
    const port = Number(new URL(base).port);
    const statusCode = await new Promise<number>((resolve) => {
      const req = http.request(
        { host: "127.0.0.1", port, path: "/api/trade", method: "POST" },
        (res) => {
          expect(res.statusCode).toBe(413);
          res.resume();
          res.on("end", () => resolve(res.statusCode ?? 0));
        },
      );
      req.on("error", () => resolve(0));
      req.write(Buffer.alloc(120 * 1024, "a"));
      req.end();
    });
    expect(statusCode).toBe(413);
  });
});

describe("generic server errors", () => {
  it("GET /api/personalities returns a generic 500 message on failure", async () => {
    const failingServer = await createServer({
      port: 0,
      realBroker: false,
      deps: {
        getFundamentals: async () => {
          throw new Error("Data fetch error");
        },
      },
    });
    await new Promise<void>((resolve) => failingServer.listen(0, () => resolve()));
    const addr = failingServer.address();
    const customBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 8787}`;

    try {
      const res = await fetch(`${customBase}/api/personalities`);
      expect(res.status).toBe(500);
      const body = await readJson(res);
      expect(body.error).toBe("Internal server error");
      expect(Array.isArray(body.personalities)).toBe(true);
      expect(body.personalities).toHaveLength(0);
    } finally {
      failingServer.close();
    }
  });

  it("GET /api/portfolio returns a generic 500 on non-auth broker failure", async () => {
    const failingBroker: Broker = {
      name: "upstox",
      isAuthenticated: true,
      getAuthUrl: () => "",
      authenticate: async () => {},
      getHoldings: async () => {
        throw new Error("upstream exploded");
      },
      getPositions: async () => [],
      getOrders: async () => [],
      placeOrder: async () => ({ id: "mock-order" }),
    };
    const customServer = await createServer({
      port: 0,
      realBroker: false,
      deps: { broker: failingBroker },
    });
    await new Promise<void>((resolve) => customServer.listen(0, () => resolve()));
    const addr = customServer.address();
    const customBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 8787}`;

    try {
      const res = await fetch(`${customBase}/api/portfolio`);
      expect(res.status).toBe(500);
      const body = await readJson(res);
      expect(body.error).toBe("Internal server error");
      expect(body.expired).toBeUndefined();
    } finally {
      customServer.close();
    }
  });
});
