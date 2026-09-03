import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { z } from "zod";
import { getLiveNifty50Fundamentals, mergeFundamentals } from "./data/live-nifty50.js";
import { PERSONALITIES } from "./data/nifty50.js";
import { BacktestEngine, smaCrossover } from "./engines/backtest.js";
import { DatabaseService } from "./services/database.js";
import { fetchStockNews } from "./services/news.js";
import { YahooFinanceService } from "./services/yahoo-finance.js";
import { HistoricalPriceSchema, QuoteSchema } from "./types/index.js";

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

const yahoo = new YahooFinanceService();
const PORT = Number(process.env.PORT ?? 8787);

/** Minimal JSON helper. */
function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

/** Handle async request handlers, converting errors to a 500 JSON response. */
function wrap(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> | void,
) {
  return (req: http.IncomingMessage, res: http.ServerResponse) => {
    Promise.resolve(handler(req, res)).catch((err) => {
      sendJson(res, 500, { error: err instanceof Error ? err.message : "Unknown error" });
    });
  };
}

async function route(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const { pathname, searchParams } = url;

  // --- JSON API ---
  if (pathname === "/api/personalities") {
    const universe = mergeFundamentals(await getLiveNifty50Fundamentals());
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
    const universe = mergeFundamentals(await getLiveNifty50Fundamentals());
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

  if (pathname === "/api/quote") {
    const symbol = searchParams.get("symbol")?.toUpperCase();
    if (!symbol) {
      sendJson(res, 400, { error: "Missing ?symbol=X" });
      return;
    }
    const quote = await yahoo.getQuote(symbol);
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
    const prices = await yahoo.getHistoricalPrices(symbol, range);
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

const server = http.createServer(wrap(route));
server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`StockPulse dashboard: ${url}`);
  if (process.env.OPEN_BROWSER === "1") {
    const cmd =
      process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    const args = process.platform === "win32" ? [] : [url];
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  }
});
