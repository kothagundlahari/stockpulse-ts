import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { z } from "zod";
import { PERSONALITIES } from "./data/nifty50.js";
import { getNifty500Fundamentals } from "./data/nifty500.js";
import { BacktestEngine, smaCrossover } from "./engines/backtest.js";
import { recommendHolding, smaFromDaily } from "./engines/holding-recommendation.js";
import { ScreenerEngine } from "./engines/screener.js";
import { connectUpstox, getUpstoxClient } from "./services/broker.js";
import type { Broker } from "./services/broker-types.js";
import { DatabaseService } from "./services/database.js";
import { fetchStockNews } from "./services/news.js";
import { OllamaService } from "./services/ollama.js";
import type { UpstoxClient } from "./services/upstox.js";
import { YahooFinanceService } from "./services/yahoo-finance.js";
import {
  type Fundamentals,
  HistoricalPriceSchema,
  QuoteSchema,
  type ScreenerCriteria,
} from "./types/index.js";

const PUBLIC_DIR = path.join(process.cwd(), "public");

const VALID_RANGES = new Set([
  "1d",
  "5d",
  "1mo",
  "3mo",
  "6mo",
  "1y",
  "2y",
  "5y",
  "10y",
  "ytd",
  "max",
]);

const PORT = Number(process.env.PORT ?? 8787);

export interface ServerDeps {
  upstox: UpstoxClient | Broker;
  yahoo: YahooFinanceService;
  getFundamentals: () => Promise<Fundamentals[]>;
  ollama?: OllamaService;
  connectUpstox?: (code: string) => Promise<Broker>;
}

/** Minimal JSON helper. */
export function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

/** Parse JSON request body. */
export async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
  }
  if (chunks.length === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

/** Handle async request handlers, converting errors to a 500 JSON response. */
export function wrap(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> | void,
) {
  return (req: http.IncomingMessage, res: http.ServerResponse) => {
    Promise.resolve(handler(req, res)).catch((err) => {
      sendJson(res, 500, { error: err instanceof Error ? err.message : "Unknown error" });
    });
  };
}

export async function router(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  deps: ServerDeps,
): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const { pathname, searchParams } = url;

  // --- JSON API ---
  if (pathname === "/api/personalities") {
    const universe = await deps.getFundamentals();
    const result = PERSONALITIES.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      matches: universe.filter(p.filter).length,
      stocks: universe.filter(p.filter),
    }));
    sendJson(res, 200, { total: universe.length, personalities: result });
    return;
  }

  if (pathname.startsWith("/api/personalities/")) {
    const id = pathname.split("/").pop();
    const personality = PERSONALITIES.find((p) => p.id === id);
    if (!personality) {
      sendJson(res, 404, { error: `Unknown personality: ${id}` });
      return;
    }
    const universe = await deps.getFundamentals();
    sendJson(res, 200, {
      id: personality.id,
      name: personality.name,
      description: personality.description,
      total: universe.length,
      matches: universe.filter(personality.filter).length,
      stocks: universe.filter(personality.filter),
    });
    return;
  }

  if (pathname === "/api/screen") {
    const universe = await deps.getFundamentals();
    const numericParams = [
      "minMarketCap",
      "maxMarketCap",
      "minPe",
      "maxPe",
      "minPb",
      "maxPb",
      "minDividendYield",
      "minRoe",
      "maxDebtToEquity",
      "minRevenueGrowth",
    ];
    for (const name of numericParams) {
      const raw = searchParams.get(name);
      if (raw !== null && Number.isNaN(Number(raw))) {
        sendJson(res, 400, { error: `Invalid numeric criteria "${name}".` });
        return;
      }
    }
    const criteria: ScreenerCriteria = {};
    if (searchParams.has("minMarketCap"))
      criteria.minMarketCap = Number(searchParams.get("minMarketCap"));
    if (searchParams.has("maxMarketCap"))
      criteria.maxMarketCap = Number(searchParams.get("maxMarketCap"));
    if (searchParams.has("minPe")) criteria.minPe = Number(searchParams.get("minPe"));
    if (searchParams.has("maxPe")) criteria.maxPe = Number(searchParams.get("maxPe"));
    if (searchParams.has("minPb")) criteria.minPb = Number(searchParams.get("minPb"));
    if (searchParams.has("maxPb")) criteria.maxPb = Number(searchParams.get("maxPb"));
    if (searchParams.has("minDividendYield"))
      criteria.minDividendYield = Number(searchParams.get("minDividendYield"));
    if (searchParams.has("minRoe")) criteria.minRoe = Number(searchParams.get("minRoe"));
    if (searchParams.has("maxDebtToEquity"))
      criteria.maxDebtToEquity = Number(searchParams.get("maxDebtToEquity"));
    if (searchParams.has("minRevenueGrowth"))
      criteria.minRevenueGrowth = Number(searchParams.get("minRevenueGrowth"));

    const screener = new ScreenerEngine();
    const matched = screener.filter(universe, criteria);
    sendJson(res, 200, { total: universe.length, matches: matched.length, stocks: matched });
    return;
  }

  if (pathname === "/api/broker") {
    sendJson(res, 200, {
      authenticated: deps.upstox.isAuthenticated,
      authUrl: deps.upstox.getAuthUrl(),
    });
    return;
  }

  if (pathname === "/api/broker/auth" && req.method === "POST") {
    const body = (await readBody(req)) as { code?: string };
    if (!body.code) {
      sendJson(res, 400, { error: "Missing auth code" });
      return;
    }
    const code = body.code;
    try {
      const client = deps.connectUpstox
        ? await deps.connectUpstox(code)
        : await (async () => {
            await connectUpstox(code);
            return getUpstoxClient();
          })();
      deps.upstox = client;
      sendJson(res, 200, { ok: true });
    } catch (e) {
      sendJson(res, 500, { error: e instanceof Error ? e.message : "Authentication failed" });
    }
    return;
  }

  if (pathname === "/api/portfolio") {
    try {
      const holdings = await deps.upstox.getHoldings();
      const totalValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);
      const enriched = await Promise.all(
        holdings.map(async (h) => {
          let fundamentals: Fundamentals | undefined;
          let price = { current: h.ltp, sma10: 0, sma50: 0 };
          try {
            fundamentals = await deps.yahoo.getFundamentals(h.symbol);
            const daily = await deps.yahoo.getHistoricalPrices(h.symbol, "3mo");
            const sma = smaFromDaily(daily);
            price = { current: h.ltp, sma10: sma.sma10, sma50: sma.sma50 };
          } catch {
            // keep defaults on error
          }
          const weight = totalValue > 0 ? (h.currentValue / totalValue) * 100 : 0;
          const recommendation = recommendHolding(h, fundamentals, price, weight);
          return { ...h, recommendation };
        }),
      );
      sendJson(res, 200, { total: totalValue, holdings: enriched });
    } catch (e) {
      sendJson(res, 500, { error: e instanceof Error ? e.message : "Failed to fetch portfolio" });
    }
    return;
  }

  if (pathname === "/api/orders") {
    try {
      const orders = await deps.upstox.getOrders();
      sendJson(res, 200, { orders });
    } catch (e) {
      sendJson(res, 500, { error: e instanceof Error ? e.message : "Failed to fetch orders" });
    }
    return;
  }

  if (pathname === "/api/trade" && req.method === "POST") {
    const body = (await readBody(req)) as {
      symbol?: unknown;
      side?: unknown;
      qty?: unknown;
      type?: unknown;
      limitPrice?: unknown;
      confirm?: unknown;
    };
    if (body.confirm !== true) {
      sendJson(res, 400, { error: "Trade not confirmed. Set confirm:true to place a real order." });
      return;
    }
    if (typeof body.symbol !== "string" || body.symbol.trim() === "") {
      sendJson(res, 400, { error: "Missing or invalid symbol." });
      return;
    }
    if (body.side !== "BUY" && body.side !== "SELL") {
      sendJson(res, 400, { error: "Invalid side. Must be BUY or SELL." });
      return;
    }
    if (body.type !== "LIMIT" && body.type !== "MARKET") {
      sendJson(res, 400, { error: "Invalid type. Must be LIMIT or MARKET." });
      return;
    }
    if (typeof body.qty !== "number" || !Number.isInteger(body.qty) || body.qty <= 0) {
      sendJson(res, 400, { error: "Invalid qty. Must be a positive integer." });
      return;
    }
    if (
      body.type === "LIMIT" &&
      (typeof body.limitPrice !== "number" || body.limitPrice <= 0 || Number.isNaN(body.limitPrice))
    ) {
      sendJson(res, 400, { error: "limitPrice must be a positive number for LIMIT orders." });
      return;
    }
    try {
      const result = await deps.upstox.placeOrder({
        symbol: body.symbol,
        qty: body.qty,
        side: body.side,
        type: body.type,
        limitPrice: typeof body.limitPrice === "number" ? body.limitPrice : undefined,
        confirm: true,
      });
      sendJson(res, 200, { id: result.id });
    } catch (e) {
      sendJson(res, 500, { error: e instanceof Error ? e.message : "Order placement failed" });
    }
    return;
  }

  if (pathname === "/api/ai") {
    let available = false;
    try {
      const ollama = deps.ollama ?? new OllamaService();
      available = await ollama.isRunning();
    } catch {
      available = false;
    }
    sendJson(res, 200, { available });
    return;
  }

  if (pathname === "/api/quote") {
    const symbol = searchParams.get("symbol")?.toUpperCase();
    if (!symbol) {
      sendJson(res, 400, { error: "Missing ?symbol=X" });
      return;
    }
    const quote = await deps.yahoo.getQuote(symbol);
    const parsed = QuoteSchema.safeParse(quote);
    if (!parsed.success) {
      sendJson(res, 502, { error: `Invalid quote data from upstream: ${parsed.error.message}` });
      return;
    }
    sendJson(res, 200, parsed.data);
    return;
  }

  if (pathname === "/api/backtest") {
    const symbol = searchParams.get("symbol")?.toUpperCase();
    const range = searchParams.get("range") ?? "1y";
    if (!symbol) {
      sendJson(res, 400, { error: "Missing ?symbol=X" });
      return;
    }
    if (!VALID_RANGES.has(range)) {
      sendJson(res, 400, {
        error: `Invalid ?range=${range}. Valid values: ${[...VALID_RANGES].join(", ")}`,
      });
      return;
    }
    const prices = await deps.yahoo.getHistoricalPrices(symbol, range);
    if (prices.length === 0) {
      sendJson(res, 404, { error: `No price data for ${symbol}` });
      return;
    }
    const parsedPrices = z.array(HistoricalPriceSchema).safeParse(prices);
    if (!parsedPrices.success) {
      sendJson(res, 502, { error: `Invalid historical price data: ${parsedPrices.error.message}` });
      return;
    }
    const engine = new BacktestEngine();
    const result = engine.run(prices, 100000, smaCrossover);
    sendJson(res, 200, { symbol, range, result });
    return;
  }

  if (pathname === "/api/journal") {
    const db = new DatabaseService();
    const entries = db.getJournalEntries();
    db.close();
    sendJson(res, 200, { entries });
    return;
  }

  if (pathname === "/api/news") {
    const symbol = searchParams.get("symbol")?.toUpperCase();
    if (!symbol) {
      sendJson(res, 400, { error: "Missing ?symbol=X" });
      return;
    }
    sendJson(res, 200, await fetchStockNews(symbol, Number(searchParams.get("limit") ?? 10)));
    return;
  }

  // --- Static dashboard ---
  const filePath = pathname === "/" ? "/index.html" : pathname;
  const resolved = path.normalize(path.join(PUBLIC_DIR, filePath));
  if (!resolved.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(resolved, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(resolved);
    const type: Record<string, string> = {
      ".html": "text/html",
      ".css": "text/css",
      ".js": "application/javascript",
    };
    res.writeHead(200, { "Content-Type": `${type[ext] ?? "text/plain"}; charset=utf-8` });
    res.end(data);
  });
}

export interface ServerOptions {
  port?: number;
  realBroker?: boolean;
  deps?: Partial<ServerDeps>;
}

export async function createServer(opts: ServerOptions = {}): Promise<http.Server> {
  const realBroker = opts.realBroker ?? true;
  const deps: ServerDeps = {
    upstox:
      opts.deps?.upstox ??
      (realBroker
        ? getUpstoxClient()
        : {
            name: "upstox",
            isAuthenticated: false,
            getAuthUrl: () => "https://api.upstox.com/v2/login/authorization/dialog",
            authenticate: async () => {},
            getHoldings: async () => [],
            getPositions: async () => [],
            getOrders: async () => [],
            placeOrder: async () => ({ id: "mock-order" }),
          }),
    yahoo: opts.deps?.yahoo ?? new YahooFinanceService(),
    getFundamentals:
      opts.deps?.getFundamentals ??
      (realBroker
        ? () => getNifty500Fundamentals()
        : async () => [
            {
              symbol: "RELIANCE",
              peRatio: 15,
              pbRatio: 2,
              dividendYield: 1.5,
              roe: 18,
              debtToEquity: 0.5,
              marketCap: 1500000,
            },
          ]),
    ollama:
      opts.deps?.ollama ??
      (realBroker ? new OllamaService() : ({ isRunning: async () => false } as OllamaService)),
    connectUpstox:
      opts.deps?.connectUpstox ??
      (async (code: string) => {
        await connectUpstox(code);
        return getUpstoxClient();
      }),
  };

  return http.createServer(wrap((req, res) => router(req, res, deps)));
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("server.ts") || process.argv[1].endsWith("server.js"));

if (isMain) {
  const s = await createServer({ port: PORT, realBroker: true });
  s.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`StockPulse dashboard: ${url}`);
    if (process.env.OPEN_BROWSER === "1") {
      const cmd =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? "start"
            : "xdg-open";
      const args = process.platform === "win32" ? [] : [url];
      spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
    }
  });
}
