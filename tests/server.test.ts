import type http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";

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

  it("GET /api/screen validates criteria and returns an array", async () => {
    const res = await fetch(`${base}/api/screen?minPe=10&maxPe=20`);
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
});
