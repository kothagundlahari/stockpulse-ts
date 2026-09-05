import { spawn } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import tls from "node:tls";
import { getNifty500Fundamentals } from "./data/nifty500.js";
import { screener } from "./engines/screener.js";
import { connectUpstox, disconnectUpstox, getBroker } from "./services/broker.js";
import type { Broker } from "./services/broker-types.js";
import { DatabaseService } from "./services/database.js";
import { fetchStockNews } from "./services/news.js";
import { OllamaService } from "./services/ollama.js";
import { loadPortfolio } from "./services/portfolio.js";
import { YahooFinanceService } from "./services/yahoo-finance.js";
import { type Criteria, CriteriaSchema, type Fundamentals, QuoteSchema } from "./types/index.js";

const PUBLIC_DIR = path.join(process.cwd(), "public");

const REAL_PUBLIC_DIR = path.resolve(fs.realpathSync(PUBLIC_DIR));

/** Allow-listed NSE ticker characters: blocks path/URL manipulation in outbound requests. */
export function assertValidSymbol(symbol: string): boolean {
  return /^[A-Z0-9.-]{1,20}$/.test(symbol);
}

export const MAX_BODY_BYTES = 100 * 1024;

const PORT = Number(process.env.PORT ?? 8787);

const OAUTH_STATE_COOKIE = "sp_oauth_state";
const HOST = process.env.HOST ?? "127.0.0.1";

export interface ServerDeps {
  broker: Broker;
  yahoo: YahooFinanceService;
  getFundamentals: () => Promise<Fundamentals[]>;
  db?: DatabaseService;
  ollama?: OllamaService;
  connectUpstox?: (code: string) => Promise<Broker>;
  disconnectUpstox?: () => void;
}

/** Minimal JSON helper. */
export function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
) {
  res.setHeader("Cache-Control", "no-store");
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...extraHeaders });
  res.end(JSON.stringify(body));
}

const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};

/** Apply security headers to every response (HSTS only over real TLS). */
function applySecurityHeaders(req: http.IncomingMessage, res: http.ServerResponse): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
  if (req.socket instanceof tls.TLSSocket) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
  }
}

/** Thrown by readBody when a request body exceeds MAX_BODY_BYTES. */
class PayloadTooLargeError extends Error {
  name = "PayloadTooLargeError";
}

/** Parse JSON request body. */
export async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new PayloadTooLargeError(`Request body exceeds ${MAX_BODY_BYTES} bytes`);
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer);
    size += buf.length;
    if (size > MAX_BODY_BYTES) {
      throw new PayloadTooLargeError(`Request body exceeds ${MAX_BODY_BYTES} bytes`);
    }
    chunks.push(buf);
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

/** Read a single cookie value from a Cookie header. */
function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, value] = part.trim().split("=");
    if (key === name) return value ?? "";
  }
  return null;
}

/** Constant-time string comparison. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Handle async request handlers, converting errors to a 500 JSON response. */
export function wrap(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> | void,
) {
  return (req: http.IncomingMessage, res: http.ServerResponse) => {
    applySecurityHeaders(req, res);
    Promise.resolve(handler(req, res)).catch((err) => {
      if (err instanceof PayloadTooLargeError) {
        sendJson(res, 413, { error: "Payload too large" });
        return;
      }
      console.error("[server] Unhandled error:", err);
      sendJson(res, 500, { error: "Internal server error" });
    });
  };
}

function isAuthExpiredError(e: unknown): boolean {
  if (typeof e === "object" && e !== null) {
    const status = (e as { response?: { status?: number } }).response?.status;
    if (status === 401 || status === 403) return true;
    const message = (e as { message?: string }).message;
    if (
      typeof message === "string" &&
      (message.includes("401") || /not authenticated/i.test(message))
    ) {
      return true;
    }
  }
  return false;
}

function handleBrokerError(e: unknown, res: http.ServerResponse, deps: ServerDeps): void {
  if (isAuthExpiredError(e)) {
    if (deps.disconnectUpstox) {
      deps.disconnectUpstox();
    } else {
      disconnectUpstox();
    }
    deps.broker = getBroker();
    sendJson(res, 401, {
      error: "Upstox session expired. Please re-authorize.",
      expired: true,
    });
    return;
  }
  console.error("[server] Broker request failed:", e);
  sendJson(res, 500, { error: "Internal server error" });
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
    try {
      const universe = await deps.getFundamentals();
      sendJson(res, 200, screener.runAllPersonalities(universe));
    } catch (e) {
      console.error("[server] Failed to load personalities:", e);
      sendJson(res, 500, {
        error: "Internal server error",
        personalities: [],
        total: 0,
      });
    }
    return;
  }

  if (pathname.startsWith("/api/personalities/")) {
    const id = pathname.split("/").pop() ?? "";
    if (!screener.getPersonality(id)) {
      sendJson(res, 404, { error: `Unknown personality: ${id}` });
      return;
    }
    const universe = await deps.getFundamentals();
    const detail = screener.runPersonalityDetail(universe, id);
    if (!detail) {
      sendJson(res, 404, { error: `Unknown personality: ${id}` });
      return;
    }
    sendJson(res, 200, detail);
    return;
  }

  if (pathname === "/api/screen" || pathname === "/api/screener") {
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
    const criteria: Criteria = {};
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

    const parsed = CriteriaSchema.safeParse(criteria);
    if (!parsed.success) {
      sendJson(res, 400, { error: "Invalid criteria." });
      return;
    }

    const matched = screener.runCriteria(universe, parsed.data);
    sendJson(res, 200, { total: universe.length, matches: matched.length, stocks: matched });
    return;
  }

  // --- OAuth callback ---
  if (pathname === "/callback") {
    const clearStateCookie = () => {
      res.setHeader("Set-Cookie", `${OAUTH_STATE_COOKIE}=; Max-Age=0; Path=/`);
    };
    const cookieState = readCookie(req.headers.cookie, OAUTH_STATE_COOKIE);
    const queryState = searchParams.get("state");
    if (!cookieState || !queryState || !safeEqual(cookieState, queryState)) {
      clearStateCookie();
      sendJson(res, 403, { error: "OAuth state mismatch" });
      return;
    }

    const error = searchParams.get("error");
    if (error) {
      clearStateCookie();
      res.writeHead(302, {
        Location: `/?broker=error&message=${encodeURIComponent(error)}`,
      });
      res.end();
      return;
    }

    const code = searchParams.get("code");
    if (!code) {
      clearStateCookie();
      res.writeHead(302, {
        Location: `/?broker=error&message=${encodeURIComponent("Missing authorization code")}`,
      });
      res.end();
      return;
    }

    try {
      const client = deps.connectUpstox
        ? await deps.connectUpstox(code)
        : await (async () => {
            await connectUpstox(code);
            return getBroker();
          })();
      deps.broker = client;
      clearStateCookie();
      res.writeHead(302, { Location: "/?broker=connected" });
      res.end();
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Authentication failed";
      clearStateCookie();
      res.writeHead(302, {
        Location: `/?broker=error&message=${encodeURIComponent(msg)}`,
      });
      res.end();
      return;
    }
  }

  if (pathname === "/api/broker") {
    if (deps.broker.isAuthenticated) {
      sendJson(res, 200, { authenticated: true, authUrl: deps.broker.getAuthUrl() });
      return;
    }
    const state = randomBytes(16).toString("hex");
    sendJson(
      res,
      200,
      { authenticated: false, authUrl: deps.broker.getAuthUrl(state), state },
      {
        "Set-Cookie": `${OAUTH_STATE_COOKIE}=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`,
      },
    );
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
            return getBroker();
          })();
      deps.broker = client;
      sendJson(res, 200, { ok: true });
    } catch (e) {
      sendJson(res, 500, { error: e instanceof Error ? e.message : "Authentication failed" });
    }
    return;
  }

  if (pathname === "/api/broker/disconnect" && req.method === "POST") {
    if (deps.disconnectUpstox) {
      deps.disconnectUpstox();
    } else {
      disconnectUpstox();
    }
    deps.broker = getBroker();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/portfolio") {
    try {
      const snapshot = await loadPortfolio(deps.broker, deps.yahoo, deps.db);
      sendJson(res, 200, snapshot);
    } catch (e) {
      handleBrokerError(e, res, deps);
    }
    return;
  }

  if (pathname === "/api/orders") {
    try {
      const orders = await deps.broker.getOrders();
      sendJson(res, 200, { orders });
    } catch (e) {
      handleBrokerError(e, res, deps);
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
      sendJson(res, 400, { error: "Order not confirmed. Set confirm:true to place a real order." });
      return;
    }
    if (typeof body.symbol !== "string" || body.symbol.trim() === "") {
      sendJson(res, 400, { error: "Missing or invalid symbol." });
      return;
    }
    if (typeof body.symbol !== "string" || !assertValidSymbol(body.symbol.toUpperCase())) {
      sendJson(res, 400, { error: "Invalid symbol" });
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
      const result = await deps.broker.placeOrder({
        symbol: body.symbol,
        qty: body.qty,
        side: body.side,
        type: body.type,
        limitPrice: typeof body.limitPrice === "number" ? body.limitPrice : undefined,
        confirm: true,
      });
      sendJson(res, 200, { id: result.id });
    } catch (e) {
      handleBrokerError(e, res, deps);
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
    if (!assertValidSymbol(symbol)) {
      sendJson(res, 400, { error: "Invalid symbol" });
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

  if (pathname === "/api/news") {
    const symbol = searchParams.get("symbol")?.toUpperCase();
    if (!symbol) {
      sendJson(res, 400, { error: "Missing ?symbol=X" });
      return;
    }
    if (!assertValidSymbol(symbol)) {
      sendJson(res, 400, { error: "Invalid symbol" });
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
  let realResolved: string;
  try {
    realResolved = fs.realpathSync(resolved);
  } catch {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  if (!realResolved.startsWith(REAL_PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(realResolved, (err, data) => {
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
  https?: boolean;
}

export async function createServer(opts: ServerOptions = {}): Promise<http.Server> {
  const realBroker = opts.realBroker ?? true;
  const deps: ServerDeps = {
    broker:
      opts.deps?.broker ??
      (realBroker
        ? getBroker()
        : {
            name: "upstox",
            isAuthenticated: false,
            getAuthUrl: (state?: string) =>
              state
                ? `https://api.upstox.com/v2/login/authorization/dialog?state=${encodeURIComponent(state)}`
                : "https://api.upstox.com/v2/login/authorization/dialog",
            authenticate: async () => {},
            getHoldings: async () => [],
            getPositions: async () => [],
            getOrders: async () => [],
            placeOrder: async () => ({ id: "mock-order" }),
          }),
    yahoo: opts.deps?.yahoo ?? new YahooFinanceService(),
    db: opts.deps?.db ?? new DatabaseService(),
    getFundamentals:
      opts.deps?.getFundamentals ??
      (realBroker
        ? () => getNifty500Fundamentals(false, opts.deps?.db)
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
        return getBroker();
      }),
    disconnectUpstox: opts.deps?.disconnectUpstox ?? (() => disconnectUpstox()),
  };

  const handler = wrap((req, res) => router(req, res, deps));

  const certPath = path.join(process.cwd(), "certs", "localhost.pem");
  const keyPath = path.join(process.cwd(), "certs", "localhost-key.pem");
  const shouldHttps =
    opts.https ??
    (process.env.NODE_ENV !== "test" && fs.existsSync(certPath) && fs.existsSync(keyPath));

  if (shouldHttps && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return https.createServer(
      {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
      },
      handler,
    );
  }
  return http.createServer(handler);
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("server.ts") || process.argv[1].endsWith("server.js"));

if (isMain) {
  const s = await createServer({ port: PORT, realBroker: true });
  const isHttps = s instanceof https.Server;
  s.listen(PORT, HOST, () => {
    const proto = isHttps ? "https" : "http";
    const url = `${proto}://localhost:${PORT}`;
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
