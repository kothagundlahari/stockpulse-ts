import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { NIFTY50, PERSONALITIES } from "./data/nifty50.js";
import { BacktestEngine, type DailyPrice } from "./engines/backtest.js";
import { DatabaseService } from "./services/database.js";
import { fetchStockNews } from "./services/news.js";
import { YahooFinanceService } from "./services/yahoo-finance.js";

const PUBLIC_DIR = path.join(process.cwd(), "public");

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
    const result = PERSONALITIES.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      matches: NIFTY50.filter(p.filter).length,
      stocks: NIFTY50.filter(p.filter),
    }));
    sendJson(res, 200, { total: NIFTY50.length, personalities: result });
    return;
  }

  if (pathname === "/api/personalities/:id" || pathname.startsWith("/api/personalities/")) {
    const id = pathname.split("/").pop();
    const personality = PERSONALITIES.find((p) => p.id === id);
    if (!personality) {
      sendJson(res, 404, { error: `Unknown personality: ${id}` });
      return;
    }
    sendJson(res, 200, {
      id: personality.id,
      name: personality.name,
      description: personality.description,
      total: NIFTY50.length,
      matches: NIFTY50.filter(personality.filter).length,
      stocks: NIFTY50.filter(personality.filter),
    });
    return;
  }

  if (pathname === "/api/quote") {
    const symbol = searchParams.get("symbol")?.toUpperCase();
    if (!symbol) {
      sendJson(res, 400, { error: "Missing ?symbol=X" });
      return;
    }
    sendJson(res, 200, await yahoo.getQuote(symbol));
    return;
  }

  if (pathname === "/api/backtest") {
    const symbol = searchParams.get("symbol")?.toUpperCase();
    const range = searchParams.get("range") ?? "1y";
    if (!symbol) {
      sendJson(res, 400, { error: "Missing ?symbol=X" });
      return;
    }
    const prices = await yahoo.getHistoricalPrices(symbol, range);
    if (prices.length === 0) {
      sendJson(res, 404, { error: `No price data for ${symbol}` });
      return;
    }
    const smaCrossover = (data: DailyPrice[], idx: number): "BUY" | "SELL" | "HOLD" => {
      if (idx < 20) return "HOLD";
      const shortSma = avg(data, idx, 10);
      const longSma = avg(data, idx, 20);
      if (shortSma > longSma) return "BUY";
      if (shortSma < longSma) return "SELL";
      return "HOLD";
    };
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

function avg(data: DailyPrice[], idx: number, period: number): number {
  let sum = 0;
  for (let i = idx - period + 1; i <= idx; i++) {
    sum += data[i].close;
  }
  return sum / period;
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
