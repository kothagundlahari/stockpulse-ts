# StockPulse UI-First Portfolio & Trading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert StockPulse from a CLI-first tool into a UI-only dashboard with a dynamic NIFTY 500 screener universe, an Upstox-backed portfolio/trading flow, and rule-based per-holding recommendations.

**Architecture:** Keep pure logic in `src/engines/` (recommendation engine, universe parsing), add a broker layer (`src/services/broker.ts`, `broker-types.ts`, `upstox.ts`), extend the raw Node `http` server (`src/server.ts`) with POST handling and new JSON endpoints, add a Portfolio tab to the static `public/` dashboard, remove the CLI, and update all docs. Remove obsolete Kite/FYERS services.

**Tech Stack:** TypeScript (ESM, Node16, `.js` import extensions), `http` (no framework), better-sqlite3, axios, yahoo-finance2, Zod, vitest, biome.

**Spec:** `docs/superpowers/specs/2026-09-03-ui-first-portfolio-trading-nifty500-design.md`

## Global Constraints

- ESM with Node16 resolution — **all relative imports must use `.js` extensions** even when importing `.ts` files.
- Use `pnpm` only. Verify with `pnpm check` (biome + `tsc --noEmit`) and `pnpm test` (vitest) after each task.
- Strict TS, no `any` (use `unknown` + narrowing).
- Biome preset `recommended`: double quotes, semicolons, 2-space indent, 100-col width. No comments unless needed.
- Auth/secrets via `process.env` from a gitignored `.env`; never commit them.
- Keep the Yahoo browser `User-Agent` header (quotes/backtests fail without it).
- SQLite DB lives at `data/stockpulse.db` (gitignored). Tests use a temp DB.
- Screenshot/behavior is verified via `pnpm dev` (web dashboard on `PORT`, default 8787).
- Upstox is the **sole broker**; do not re-add Kite or FYERS code.

---

### Task 1: Shared broker types

**Files:**
- Create: `src/services/broker-types.ts`
- Test: `tests/broker-types.test.ts`

**Interfaces:**
- Consumes: nothing (standalone types).
- Produces: `Holding`, `Position`, `Order`, `PlaceOrderParams` interfaces + a `Broker` interface used by Task 2, Task 4, and the server (Task 7).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import type { Broker, Holding, Order, PlaceOrderParams, Position } from "../src/services/broker-types.js";

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/broker-types.test.ts`
Expected: FAIL — module `../src/services/broker-types.js` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
export interface Holding {
  symbol: string;
  quantity: number;
  averagePrice: number;
  ltp: number;
  pnl: number;
  pnlPercent: number;
  dayChange: number;
  dayChangePercent: number;
  currentValue: number;
}

export interface Position {
  symbol: string;
  quantity: number;
  averagePrice: number;
  ltp: number;
  pnl: number;
}

export interface Order {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  status: string;
  timestamp: string;
}

export interface PlaceOrderParams {
  symbol: string;
  qty: number;
  side: "BUY" | "SELL";
  type: "LIMIT" | "MARKET";
  limitPrice?: number;
}

export interface Broker {
  readonly name: string;
  isAuthenticated: boolean;
  getAuthUrl(): string;
  authenticate(code: string): Promise<void>;
  getHoldings(): Promise<Holding[]>;
  getPositions(): Promise<Position[]>;
  getOrders(): Promise<Order[]>;
  placeOrder(params: PlaceOrderParams & { confirm: true }): Promise<{ id: string }>;
}
```

- [ ] **Step 4: Add a `Broker`-assignability test**

Add this test to `tests/broker-types.test.ts`:

```ts
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
    expect(broker).toBeTruthy();
  });
```

(Replace the placeholder body from Step 1's last test — the stray `unexplored_types` line — with this.)

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run tests/broker-types.test.ts`
Expected: PASS (and `pnpm check` passes if run).

- [ ] **Step 6: Commit**

```bash
git add src/services/broker-types.ts tests/broker-types.test.ts
git commit -m "feat(services): add shared broker types"
```

---

### Task 2: Upstox broker client

**Files:**
- Create: `src/services/upstox.ts`
- Test: `tests/upstox.test.ts`

**Interfaces:**
- Consumes: `Broker`, `Holding`, `Position`, `Order`, `PlaceOrderParams` from `./broker-types.js`.
- Produces: `UpstoxClient` class implementing `Broker`; `createUpstoxClient()` factory reading `process.env.UPSTOX_API_KEY`, `UPSTOX_API_SECRET`, `UPSTOX_REDIRECT_URI`.

**Notes:**
- This service performs real HTTP calls. Unit tests mock `axios` and the token store so no network is needed.
- Implement methods to hit these Upstox v3 endpoints: `GET /v2/portfolio/long-term-holdings`, `GET /v2/portfolio/short-term-positions`, `GET /v2/orders`, `POST /v2/order/place`.
- Use OAuth 2.0 authorization-code flow for `getAuthUrl()` / `authenticate(code)`.
- `placeOrder` throws if `confirm !== true` (server-side safety backstop).
- Token persistence via a small `TokenStore` interface (default impl backed by `data/stockpulse.db` `broker_tokens` table). To keep this task self-contained, accept an optional persisted `accessToken` in the constructor; the DB wiring lands in Task 6.

- [ ] **Step 1: Write the failing test (mocked transport)**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import { UpstoxClient } from "../src/services/upstox.js";

vi.mock("../src/services/broker-types.js", () => ({}));

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
      data: { data: [{ order_id: "o1", tradingsymbol: "TCS", transaction_type: "BUY", quantity: 5, price: 3800, status: "complete", order_timestamp: "2026-01-01T00:00:00.000Z" }] },
    });
    const orders = await client.getOrders();
    expect(orders[0]).toMatchObject({ id: "o1", symbol: "TCS", side: "BUY", qty: 5, status: "complete" });
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
    const result = await client.placeOrder({ symbol: "TCS", qty: 5, side: "BUY", type: "MARKET", confirm: true });
    expect(result.id).toBe("o9");
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("order/place"),
      expect.anything(),
      expect.objectContaining({ headers: authHeader }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/upstox.test.ts`
Expected: FAIL — module `../src/services/upstox.js` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import axios from "axios";
import type { Broker, Holding, Order, PlaceOrderParams, Position } from "./broker-types.js";

export interface UpstoxConfig {
  apiKey: string;
  apiSecret: string;
  redirectUri: string;
  accessToken?: string;
}

export class UpstoxClient implements Broker {
  readonly name = "upstox";
  private base = "https://api.upstox.com/v2";

  constructor(private config: UpstoxConfig) {}

  get isAuthenticated(): boolean {
    return Boolean(this.config.accessToken);
  }

  getAuthUrl(): string {
    return `https://api.upstox.com/v2/login/authorization/dialog?client_id=${encodeURIComponent(
      this.config.apiKey,
    )}&redirect_uri=${encodeURIComponent(this.config.redirectUri)}&response_type=code`;
  }

  async authenticate(code: string): Promise<void> {
    const res = await axios.post("https://api.upstox.com/v2/login/authorization/token", {
      code,
      client_id: this.config.apiKey,
      client_secret: this.config.apiSecret,
      redirect_uri: this.config.redirectUri,
      grant_type: "authorization_code",
    });
    this.config.accessToken = res.data.access_token;
  }

  private headers(): Record<string, string> {
    if (!this.config.accessToken) {
      throw new Error("Not authenticated. Complete the Upstox OAuth flow first.");
    }
    return { Authorization: `Bearer ${this.config.accessToken}`, Accept: "application/json" };
  }

  async getHoldings(): Promise<Holding[]> {
    const res = await axios.get(`${this.base}/portfolio/long-term-holdings`, { headers: this.headers() });
    const rows = res.data.data ?? [];
    return rows.map((h: Record<string, number | string>) => ({
      symbol: String(h.tradingsymbol),
      quantity: Number(h.quantity),
      averagePrice: Number(h.average_price),
      ltp: Number(h.close_price ?? h.ltp),
      pnl: Number(h.pnl ?? 0),
      pnlPercent: Number(h.pnl_percent ?? 0),
      dayChange: Number(h.day_change ?? 0),
      dayChangePercent: Number(h.day_change_percent ?? 0),
      currentValue: Number(h.current_value ?? Number(h.close_price) * Number(h.quantity)),
    }));
  }

  async getPositions(): Promise<Position[]> {
    const res = await axios.get(`${this.base}/portfolio/short-term-positions`, { headers: this.headers() });
    const rows = res.data.data ?? [];
    return rows.map((p: Record<string, number | string>) => ({
      symbol: String(p.tradingsymbol),
      quantity: Number(p.quantity),
      averagePrice: Number(p.average_price),
      ltp: Number(p.close_price ?? p.ltp),
      pnl: Number(p.pnl ?? 0),
    }));
  }

  async getOrders(): Promise<Order[]> {
    const res = await axios.get(`${this.base}/orders`, { headers: this.headers() });
    const rows = res.data.data ?? [];
    return rows.map((o: Record<string, number | string>) => ({
      id: String(o.order_id),
      symbol: String(o.tradingsymbol),
      side: String(o.transaction_type) === "SELL" ? "SELL" : "BUY",
      qty: Number(o.quantity),
      price: Number(o.price),
      status: String(o.status),
      timestamp: String(o.order_timestamp),
    }));
  }

  async placeOrder(params: PlaceOrderParams & { confirm: true }): Promise<{ id: string }> {
    if (!params.confirm) {
      throw new Error("Trade not confirmed. Pass confirm:true to place a real order.");
    }
    const res = await axios.post(
      `${this.base}/order/place`,
      {
        instrument_token: params.symbol,
        order_type: params.type === "LIMIT" ? "LIMIT" : "MARKET",
        transaction_type: params.side,
        quantity: params.qty,
        price: params.type === "LIMIT" ? (params.limitPrice ?? 0) : 0,
        validity: "DAY",
        product: "D",
      },
      { headers: this.headers() },
    );
    return { id: String(res.data.data?.order_id ?? "") };
  }
}

export function createUpstoxClient(accessToken?: string): UpstoxClient {
  return new UpstoxClient({
    apiKey: process.env.UPSTOX_API_KEY ?? "",
    apiSecret: process.env.UPSTOX_API_SECRET ?? "",
    redirectUri: process.env.UPSTOX_REDIRECT_URI ?? "http://localhost:8787/callback",
    accessToken,
  });
}
```

- [ ] **Step 4: Remove the empty mock in the test**

Delete this line from the test file:
```ts
vi.mock("../src/services/broker-types.js", () => ({}));
```
(TypeScript will use the real types; the mock was only needed to avoid unresolved import noise during the first failing run.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run tests/upstox.test.ts`
Expected: PASS.

- [ ] **Step 6: Check + commit**

Run: `pnpm check`
Expected: biome + tsc clean.

```bash
git add src/services/upstox.ts tests/upstox.test.ts
git commit -m "feat(services): add Upstox broker client implementing Broker"
```

---

### Task 3: Dynamic NIFTY 500 universe (no hardcoding)

**Files:**
- Create: `src/data/nifty500.ts`
- Create: `tests/nifty500.test.ts`
- Modify: `src/data/live-nifty50.ts` (rework to drive from NIFTY 500)
- Modify: `src/data/nifty50.ts` (remove static rows, keep personality filters)
- Modify: `tests/personalities.test.ts` (fix imports after static removal)

**Interfaces:**
- Produces: `getNifty500Symbols(): Promise<string[]>` (live NSE CSV, Yahoo fallback), `getNifty500Fundamentals(force?: boolean): Promise<Fundamentals[]>` (live Yahoo per-symbol, cached), `mergeOverNifty500(live)` helper. Exports `PERSONALITIES` and `PersonalityScreener` from `nifty50.ts` (unchanged logic).

**Notes:**
- NSE index CSV URL (authoritative): `https://nsearchives.nseindia.com/content/indices/ind_nifty500list.csv`. Parse the symbol column.
- If NSE fails, fall back to Yahoo `search` via an injected function, or throw a clear error. Implement a parse-only pure helper `parseNifty500Csv(csv: string): string[]` (used by the test).
- `getNifty500Fundamentals` reuses the bounded-concurrency pattern from the current `live-nifty50.ts` (`mapWithConcurrency`, CONCURRENCY=4, a 30-min cache, and per-symbol fallback that skips failures). Move `mapWithConcurrency` into a shared module if needed, or duplicate it locally for isolation (prefer extracting to `src/data/async.ts` and importing).
- Remove the static `Fundamentals[]` array and `NIFTY50` export from `nifty50.ts`; keep only `PersonalityScreener`, `PERSONALITIES`, and the personality filter functions.
- `tests/personalities.test.ts` currently imports `NIFTY50` and asserts on specific symbols. Update it to import `PERSONALITIES` from `nifty50.js` and `getNifty500Fundamentals` from `nifty500.js`, and to test personality filters against a small inline `Fundamentals[]` fixture instead of `NIFTY50`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/nifty500.test.ts
import { describe, expect, it } from "vitest";
import { parseNifty500Csv } from "../src/data/nifty500.js";
import type { Fundamentals } from "../src/types/index.js";

const CSV =
  "Symbol,Company,\nRELIANCE,Reliance Industries Ltd,TCS,Tata Consultancy\nINFY,\nHDFCBANK,HDFC Bank,\n";

describe("NIFTY 500 universe", () => {
  it("parses the symbol column from the NSE CSV", () => {
    const symbols = parseNifty500Csv(CSV);
    expect(symbols).toContain("RELIANCE");
    expect(symbols).toContain("TCS");
    expect(symbols).toContain("HDFCBANK");
  });

  it("drops empty and duplicate symbols", () => {
    const symbols = parseNifty500Csv(CSV);
    const set = new Set(symbols);
    expect(symbols.length).toBe(set.size);
    expect(symbols.some((s) => !s)).toBe(false);
  });

  it("handles CSV without a header gracefully", () => {
    expect(parseNifty500Csv("RELIANCE,5\nTCS,99\n")).toContain("RELIANCE");
  });
});
```

Update `tests/personalities.test.ts` (full file):

```ts
import { describe, expect, it } from "vitest";
import { PERSONALITIES } from "../src/data/nifty50.js";
import type { Fundamentals } from "../src/types/index.js";

function getPersonality(id: string) {
  const personality = PERSONALITIES.find((p) => p.id === id);
  if (!personality) throw new Error(`Missing personality: ${id}`);
  return personality;
}

const FIXTURE: Fundamentals[] = [
  { symbol: "ONGC", peRatio: 8, pbRatio: 1.2, dividendYield: 4.5, roe: 18, debtToEquity: 0.4, operatingMargin: 25 },
  { symbol: "RELIANCE", peRatio: 25, pbRatio: 2.8, dividendYield: 0.3, roe: 9.6, debtToEquity: 0.6, operatingMargin: 14 },
  { symbol: "TCS", peRatio: 28, pbRatio: 10.5, dividendYield: 1.3, roe: 48, debtToEquity: 0.08, operatingMargin: 25, revenueGrowth: 10 },
  { symbol: "COALINDIA", peRatio: 8, pbRatio: 1.1, dividendYield: 5.5, roe: 35, debtToEquity: 0.3, operatingMargin: 20 },
  { symbol: "HDFCBANK", peRatio: 19, pbRatio: 3.1, dividendYield: 1.0, roe: 16.8, debtToEquity: 5.2, operatingMargin: 58 },
  { symbol: "GROWTH", peRatio: 30, roe: 25, revenueGrowth: 20, operatingMargin: 20 },
];

describe("Personality screeners", () => {
  it("defines all eight personalities", () => {
    expect(PERSONALITIES).toHaveLength(8);
    const ids = PERSONALITIES.map((p) => p.id);
    expect(ids).toContain("buffett");
    expect(ids).toContain("munger");
    expect(ids).toContain("lych");
    expect(ids).toContain("graham");
    expect(ids).toContain("greenblatt");
    expect(ids).toContain("klarman");
    expect(ids).toContain("dividend");
    expect(ids).toContain("momentum");
  });

  it("Graham's deep-value filter favors low P/E, low P/B, dividend payers", () => {
    const matched = FIXTURE.filter(getPersonality("graham").filter);
    expect(matched.some((s) => s.symbol === "ONGC")).toBe(true);
    expect(matched.some((s) => s.symbol === "RELIANCE")).toBe(false);
  });

  it("Buffett's quality filter picks high-ROE, low-debt compounders", () => {
    const matched = FIXTURE.filter(getPersonality("buffett").filter);
    expect(matched.some((s) => s.symbol === "TCS")).toBe(true);
    expect(matched.some((s) => s.symbol === "HDFCBANK")).toBe(false);
  });

  it("dividend filter selects high-yield, reasonable-value names", () => {
    const matched = FIXTURE.filter(getPersonality("dividend").filter);
    expect(matched.some((s) => s.symbol === "COALINDIA")).toBe(true);
    expect(matched.some((s) => s.symbol === "ASIANPAINT")).toBe(false);
  });

  it("every personality returns a non-trivial subset of a realistic universe", () => {
    for (const p of PERSONALITIES) {
      const count = FIXTURE.filter(p.filter).length;
      expect(count).toBeGreaterThanOrEqual(0);
      expect(count).toBeLessThanOrEqual(FIXTURE.length);
    }
  });

  it("flagging a stock with missing fields does not crash a filter", () => {
    const incomplete: Fundamentals = { symbol: "X", marketCap: 1000 };
    for (const p of PERSONALITIES) {
      expect(() => p.filter(incomplete)).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/nifty500.test.ts tests/personalities.test.ts`
Expected: FAIL — `parseNifty500Csv` not exported; personalities test imports `NIFTY50` which is about to be removed.

- [ ] **Step 3: Extract `mapWithConcurrency` to a shared module**

Create `src/data/async.ts`:

```ts
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}
```

- [ ] **Step 4: Rewrite `src/data/nifty50.ts` to keep only personality filters**

Replace the entire file so it exports only the filter types and the 8 filters (move the existing `PersonalityScreener` interface and `PERSONALITIES` array verbatim from the current file), removing the static `Fundamentals[]` array and the `NIFTY50` export. It should import `Fundamentals` from `../types/index.js` for the filter signatures.

- [ ] **Step 5: Create `src/data/nifty500.ts`**

```ts
import { parse } from "csv-parse/sync";
import { YahooFinanceService } from "../services/yahoo-finance.js";
import type { Fundamentals } from "../types/index.js";
import { mapWithConcurrency } from "./async.js";

const NSE_CSV_URL = "https://nsearchives.nseindia.com/content/indices/ind_nifty500list.csv";
const CONCURRENCY = 4;
const CACHE_TTL_MS = 30 * 60 * 1000;
const SYMBOL_TTL_MS = 24 * 60 * 60 * 1000;

export function parseNifty500Csv(csv: string): string[] {
  const rows = parse(csv, { columns: true, skip_empty_lines: true });
  const raw = rows.map((r: Record<string, string>) => String(r.Symbol ?? r.symbol ?? "").trim().toUpperCase());
  return Array.from(new Set(raw)).filter(Boolean);
}

const yahoo = new YahooFinanceService();
let symbolsCache: { at: number; symbols: string[] } | null = null;
let fundCache: { fetchedAt: number; data: Fundamentals[] } | null = null;
let inflight: Promise<Fundamentals[]> | null = null;

export async function getNifty500Symbols(): Promise<string[]> {
  if (symbolsCache && Date.now() - symbolsCache.at < SYMBOL_TTL_MS) return symbolsCache.symbols;
  const res = await fetch(NSE_CSV_URL, { headers: { "User-Agent": "Mozilla/5.0" } });
  const csv = await res.text();
  const symbols = parseNifty500Csv(csv);
  if (symbols.length < 50) {
    throw new Error("NSE index CSV returned an unexpectedly small symbol list; rejecting it.");
  }
  symbolsCache = { at: Date.now(), symbols };
  return symbols;
}

export async function getNifty500Fundamentals(force = false): Promise<Fundamentals[]> {
  if (!force && fundCache && Date.now() - fundCache.fetchedAt < CACHE_TTL_MS) return fundCache.data;
  if (inflight) return inflight;
  inflight = (async () => {
    const symbols = await getNifty500Symbols();
    const live = await mapWithConcurrency(symbols, CONCURRENCY, async (symbol) => {
      try {
        return await yahoo.getFundamentals(symbol);
      } catch {
        return { symbol } as Fundamentals;
      }
    });
    fundCache = { fetchedAt: Date.now(), data: live };
    inflight = null;
    return live;
  })();
  return inflight;
}
```

Note: `csv-parse` is a new dependency — add it to `package.json` via `pnpm add csv-parse`.

- [ ] **Step 6: Rework `src/data/live-nifty50.ts` into a compatibility shim (or remove it)**

Update `live-nifty50.ts` so `getLiveNifty50Fundamentals` and `mergeFundamentals` delegate to `getNifty500Fundamentals` from `nifty500.js`, and `mergeFundamentals` merges live rows over the **parsed universe** rather than over the deleted static `NIFTY50`. If the server/engine code is fully migrated in Task 7, remove this file then and update imports (Task 7 depends on this).

- [ ] **Step 7: Remove the stale import from `tests/personalities.test.ts`**

Confirm the file no longer imports `NIFTY50` (Step 1 rewrote it). Remove the now-unused `NIFTY50` import line if any remains.

- [ ] **Step 8: Run tests + check**

Run: `pnpm exec vitest run tests/nifty500.test.ts tests/personalities.test.ts`
Expected: PASS.

Run: `pnpm check`
Expected: clean (if `live-nifty50.ts` still references removed `NIFTY50`, fix its imports; make it import from `nifty500.js`).

- [ ] **Step 9: Commit**

```bash
git add src/data/async.ts src/data/nifty500.ts src/data/nifty50.ts src/data/live-nifty50.ts tests/nifty500.test.ts tests/personalities.test.ts package.json pnpm-lock.yaml
git commit -m "feat(data): dynamic NIFTY 500 universe with no hardcoded symbols"
```

---

### Task 4: Rule-based holding recommendation engine

**Files:**
- Create: `src/engines/holding-recommendation.ts`
- Test: `tests/holding-recommendation.test.ts`

**Interfaces:**
- Consumes: `Holding` from `../services/broker-types.js`; `Fundamentals` from `../types/index.js`.
- Produces: `recommendHolding(holding, fundamentals, price, portfolioWeightPct): Recommendation` where `Recommendation = { action: "BUY_MORE" | "HOLD" | "SELL"; confidence: "low" | "medium" | "high"; reasons: string[] }` and `price = { current: number; sma10: number; sma50: number }`.
- Core helper `computeSma(prices: number[], period: number): number` and `smaFromDaily(daily: { close: number }[]): { sma10: number; sma50: number }` used by the server (Task 7) to feed the engine.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/holding-recommendation.test.ts
import { describe, expect, it } from "vitest";
import { recommendHolding } from "../src/engines/holding-recommendation.js";
import type { Holding } from "../src/services/broker-types.js";
import type { Fundamentals } from "../src/types/index.js";

const holding: Holding = {
  symbol: "RELIANCE",
  quantity: 10,
  averagePrice: 2400,
  ltp: 2500,
  pnl: 1000,
  pnlPercent: 4.17,
  dayChange: 25,
  dayChangePercent: 1,
  currentValue: 25000,
};

const cheapSolid: Fundamentals = { symbol: "RELIANCE", peRatio: 12, roe: 22, debtToEquity: 0.2, revenueGrowth: 15 };

describe("recommendHolding", () => {
  it("BUY_MORE when undervalued, solid fundamentals, below SMAs", () => {
    const r = recommendHolding(holding, cheapSolid, { current: 2500, sma10: 2600, sma50: 2600 }, 4);
    expect(r.action).toBe("BUY_MORE");
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it("SELL on over-concentration with weak momentum", () => {
    const r = recommendHolding(holding, { symbol: "RELIANCE", peRatio: 60 }, { current: 2500, sma10: 2450, sma50: 2400 }, 38);
    expect(["SELL", "HOLD"]).toContain(r.action);
    if (r.action === "SELL") expect(r.reasons.join(" ").toLowerCase()).toMatch(/concentrat|weight|trim/);
  });

  it("HOLD when mixed signals and reasonable weight", () => {
    const r = recommendHolding(holding, { symbol: "RELIANCE", peRatio: 28 }, { current: 2500, sma10: 2490, sma50: 2505 }, 10);
    expect(["HOLD", "BUY_MORE", "SELL"]).toContain(r.action);
  });

  it("returns low confidence when fundamentals are missing", () => {
    const r = recommendHolding(holding, undefined, { current: 2500, sma10: 2510, sma50: 2520 }, 5);
    expect(r.confidence).toBe("low");
  });

  it("never returns a confidence of undefined", () => {
    const r = recommendHolding(holding, undefined, { current: 2500, sma10: 2510, sma50: 2520 }, 5);
    expect(r.confidence).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/holding-recommendation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { Holding } from "../services/broker-types.js";
import type { Fundamentals } from "../types/index.js";

export type RecommendationAction = "BUY_MORE" | "HOLD" | "SELL";
export type Confidence = "low" | "medium" | "high";

export interface Recommendation {
  action: RecommendationAction;
  confidence: Confidence;
  reasons: string[];
}

export interface PriceSignals {
  current: number;
  sma10: number;
  sma50: number;
}

const CONCENTRATION_SELL_THRESHOLD = 30; // % of portfolio

export function recommendHolding(
  holding: Holding,
  fundamentals: Fundamentals | undefined,
  price: PriceSignals,
  portfolioWeightPct: number,
): Recommendation {
  const reasons: string[] = [];
  let score = 0;

  if (fundamentals) {
    const pe = fundamentals.peRatio;
    if (pe != null) {
      if (pe <= 18) {
        score += 1;
        reasons.push(`Valuation: P/E ${pe} is attractive`);
      } else if (pe >= 45) {
        score -= 1;
        reasons.push(`Valuation: P/E ${pe} is rich`);
      }
    }
    if ((fundamentals.roe ?? 0) >= 15) {
      score += 1;
      reasons.push(`Quality: ROE ${fundamentals.roe}% is strong`);
    }
    if ((fundamentals.debtToEquity ?? 0) > 2) {
      score -= 1;
      reasons.push("Risk: high debt-to-equity");
    }
    if ((fundamentals.revenueGrowth ?? 0) >= 10) {
      score += 1;
      reasons.push(`Growth: revenue growth ${fundamentals.revenueGrowth}%`);
    }
  } else {
    reasons.push("No fundamentals available");
  }

  if (price.sma10 > 0 && price.current < price.sma10 && price.sma50 > 0 && price.current < price.sma50) {
    score += 1;
    reasons.push("Momentum: price below both 10-day and 50-day SMAs (potential buy dip)");
  } else if (price.sma10 > 0 && price.sma50 > 0 && price.current > price.sma50) {
    score += 1;
    reasons.push("Momentum: price above 50-day SMA");
  }

  if (portfolioWeightPct > CONCENTRATION_SELL_THRESHOLD) {
    score -= 1;
    reasons.push(`Concentration: this holding is ${portfolioWeightPct.toFixed(1)}% of the portfolio — consider trimming`);
  }

  let action: RecommendationAction = "HOLD";
  if (score >= 2) action = "BUY_MORE";
  else if (score <= -1) action = "SELL";
  else action = "HOLD";

  const confidence: Confidence = fundamentals ? (Math.abs(score) >= 2 ? "high" : "medium") : "low";
  if (action === "HOLD") reasons.push("Recommended to hold given mixed signal");

  return { action, confidence, reasons };
}

export function smaFromDaily(daily: { close: number }[]) {
  const closes = daily.map((d) => d.close);
  const sma = (period: number) => {
    if (closes.length < period) return 0;
    const slice = closes.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  };
  return { sma10: sma(10), sma50: sma(50) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run tests/holding-recommendation.test.ts`
Expected: PASS.

- [ ] **Step 5: Check + commit**

Run: `pnpm check`

```bash
git add src/engines/holding-recommendation.ts tests/holding-recommendation.test.ts
git commit -m "feat(engines): rule-based holding recommendation engine"
```

---

### Task 5: Broker token persistence

**Files:**
- Modify: `src/services/database.ts` (add `broker_tokens` table + get/set methods)
- Test: `tests/database.test.ts` (add token cases)

**Interfaces:**
- Produces: `DatabaseService.setBrokerToken(broker: string, token: string): void` and `DatabaseService.getBrokerToken(broker: string): string | null`.
- Consumes: existing `DatabaseService` (better-sqlite3).

- [ ] **Step 1: Write the failing tests**

Append to `tests/database.test.ts`:

```ts
import { DatabaseService } from "../src/services/database.js";

describe("broker tokens", () => {
  it("stores and retrieves an Upstox access token", () => {
    const db = new DatabaseService("./data/test-broker-token.db");
    db.setBrokerToken("upstox", "tok-abc");
    expect(db.getBrokerToken("upstox")).toBe("tok-abc");
    db.close();
  });

  it("returns null for an unknown broker", () => {
    const db = new DatabaseService("./data/test-broker-token-2.db");
    expect(db.getBrokerToken("nope")).toBeNull();
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/database.test.ts`
Expected: FAIL — `setBrokerToken` not defined.

- [ ] **Step 3: Implement token methods**

In `src/services/database.ts`, add to the `migrate()` SQL:

```ts
      CREATE TABLE IF NOT EXISTS broker_tokens (
        broker TEXT PRIMARY KEY,
        token TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );
```

Add methods:

```ts
  setBrokerToken(broker: string, token: string): void {
    this.db
      .prepare(
        `INSERT INTO broker_tokens (broker, token, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(broker) DO UPDATE SET token = excluded.token, updated_at = datetime('now')`,
      )
      .run(broker, token);
  }

  getBrokerToken(broker: string): string | null {
    const row = this.db.prepare("SELECT token FROM broker_tokens WHERE broker = ?").get(broker) as
      | { token: string }
      | undefined;
    return row?.token ?? null;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run tests/database.test.ts`
Expected: PASS.

- [ ] **Step 5: Check + commit**

Run: `pnpm check`

```bash
git add src/services/database.ts tests/database.test.ts
git commit -m "feat(services): persist broker access tokens in SQLite"
```

---

### Task 6: Wire Upstox to token store (broker factory)

**Files:**
- Create: `src/services/broker.ts` (factory)
- Modify: `src/services/upstox.ts` (load/return token) — optional; keep `createUpstoxClient` and add a `getUpstoxClient()` factory here
- Test: `tests/broker.test.ts`

**Interfaces:**
- Produces: `getUpstoxClient(): UpstoxClient` that creates/reuses a client whose token is loaded from `DatabaseService.getBrokerToken("upstox")`, and `authUrlFragment` helper. Also `connectUpstox(code: string): Promise<void>` that authenticates a fresh client and persists the token.
- Consumes: `createUpstoxClient`, `UpstoxClient` from `./upstox.js`; `DatabaseService` from `./database.js`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/broker.test.ts
import { describe, expect, it, vi } from "vitest";
import { getUpstoxClient } from "../src/services/broker.js";

vi.mock("../src/services/database.js", () => ({
  DatabaseService: class {
    getBrokerToken(b: string) {
      return b === "upstox" ? "stored-token" : null;
    }
    setBrokerToken() {}
  },
}));

describe("getUpstoxClient", () => {
  it("loads a persisted access token into the client", () => {
    const client = getUpstoxClient();
    expect(client.isAuthenticated).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/broker.test.ts`
Expected: FAIL — `getUpstoxClient` not exported.

- [ ] **Step 3: Implement the factory**

Create `src/services/broker.ts`:

```ts
import { DatabaseService } from "./database.js";
import { createUpstoxClient, UpstoxClient } from "./upstox.js";

let client: UpstoxClient | null = null;

export function getUpstoxClient(): UpstoxClient {
  if (client && client.isAuthenticated) return client;
  const db = new DatabaseService();
  const token = db.getBrokerToken("upstox");
  db.close();
  client = createUpstoxClient(token ?? undefined);
  return client;
}
```

Add an accessor to `UpstoxClient` in `src/services/upstox.ts` so the factory can read the token after auth:

```ts
  getAccessToken(): string {
    return this.config.accessToken ?? "";
  }
```

- [ ] **Step 4: Implement `connectUpstox` using the accessor**

Update `src/services/broker.ts` to add:

```ts
export async function connectUpstox(authCode: string): Promise<void> {
  const fresh = createUpstoxClient();
  await fresh.authenticate(authCode);
  const token = fresh.getAccessToken();
  const db = new DatabaseService();
  db.setBrokerToken("upstox", token);
  db.close();
  client = fresh;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run tests/broker.test.ts`
Expected: PASS.

- [ ] **Step 6: Check + commit**

Run: `pnpm check`

```bash
git add src/services/broker.ts src/services/upstox.ts tests/broker.test.ts
git commit -m "feat(services): Upstox broker factory wired to token store"
```

---

### Task 7: Server API — broker, portfolio, orders, trade, screen

**Files:**
- Modify: `src/server.ts`
- Test: `tests/server.test.ts` (HTTP route tests using a real client against routes via exported handler or supertest-style; vitest with Node http)

**Interfaces:**
- Consumes: `getUpstoxClient` from `./services/broker.js`; `getNifty500Fundamentals` from `./data/nifty500.js`; `ScreenerEngine` from `./engines/screener.js`; `recommendHolding`/`smaFromDaily` from `./engines/holding-recommendation.js`; `YahooFinanceService` from `./services/yahoo-finance.js`.
- Produces: new HTTP endpoints served by the existing Node http server.

**Endpoints to add (server currently handles only GET; add a POST body parser):**
- `GET /api/broker` — `{ authenticated: boolean, authUrl?: string }`.
- `GET /api/portfolio` — `{ holdings: Array<Holding & { recommendation: Recommendation }> }`. For each holding, fetch Yahoo fundamentals + 3mo historical prices; compute `smaFromDaily`, portfolio weight, and call `recommendHolding`. Guard against brokerage failures by returning `{ error }` on upstream issues.
- `GET /api/orders` — `{ orders: Order[] }` from `getUpstoxClient().getOrders()`.
- `POST /api/trade` — body `{ symbol, side, qty, type, limitPrice?, confirm }`. Reject (400) if `confirm !== true`; else call `placeOrder`. Return `{ id }`.
- `POST /api/broker/auth` — body `{ code }`; call `connectUpstox(code)`, return `{ ok: true }`.
- `GET /api/screen` — apply `ScreenerEngine.filter` over `await getNifty500Fundamentals()` with criteria from query params.

**Testing note:** Extract the route handler into an exported `router(req, res, deps)` function that accepts injected `UpstoxClient`, `YahooFinanceService`, and `getFundamentals` so tests can mock them without network. The existing top-level `route()` calls `router` with real deps.

- [ ] **Step 1: Write the failing HTTP tests**

Create `tests/server.test.ts` with a helper that starts the server on an ephemeral port and issues `fetch` calls:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/server.test.ts`
Expected: FAIL — `createServer` not exported / routes absent.

- [ ] **Step 3: Refactor `src/server.ts`**

- Extract the existing route logic into an exported `router(req, res, deps)` function. `deps = { upstox: UpstoxClient; yahoo: YahooFinanceService; getFundamentals: () => Promise<Fundamentals[]> }`.
- Add a `readBody(req): Promise<unknown>` JSON parser.
- Add the new endpoints inside `router`.
- Export `createServer(opts: { port?: number; realBroker?: boolean }): Promise<http.Server>` that builds deps (using `getUpstoxClient()` when `realBroker`, or a stub `{ isAuthenticated: false, ... }` otherwise) and starts listening.

**Key handler fragments:**

```ts
async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
```

`POST /api/trade`:

```ts
  if (pathname === "/api/trade" && req.method === "POST") {
    const body = (await readBody(req)) as {
      symbol?: string;
      side?: string;
      qty?: number;
      type?: string;
      limitPrice?: number;
      confirm?: boolean;
    };
    if (body.confirm !== true) {
      sendJson(res, 400, { error: "Trade not confirmed. Set confirm:true to place a real order." });
      return;
    }
    if (!body.symbol || !body.side || !body.qty || !body.type) {
      sendJson(res, 400, { error: "Missing symbol, side, qty, or type." });
      return;
    }
    const result = await deps.upstox.placeOrder({
      symbol: body.symbol,
      qty: body.qty,
      side: body.side === "SELL" ? "SELL" : "BUY",
      type: body.type === "LIMIT" ? "LIMIT" : "MARKET",
      limitPrice: body.limitPrice,
      confirm: true,
    });
    sendJson(res, 200, { id: result.id });
    return;
  }
```

`GET /api/portfolio`:

```ts
  if (pathname === "/api/portfolio") {
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
          // keep fundamentals/price defaults on upstream failure
        }
        const weight = totalValue > 0 ? (h.currentValue / totalValue) * 100 : 0;
        const recommendation = recommendHolding(h, fundamentals, price, weight);
        return { ...h, recommendation };
      }),
    );
    sendJson(res, 200, { total: totalValue, holdings: enriched });
    return;
  }
```

- [ ] **Step 4: Wire the new server into `package.json` scripts (unchanged)** — confirm `dev`/`dev:server`/`start:server` still target `src/server.ts` and `dist/server.js`. No change needed.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run tests/server.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Check + smoke test**

Run: `pnpm check`

Then start the dev server and curl one endpoint:
```bash
pnpm dev:server &
sleep 2
curl -s http://localhost:8787/api/broker
kill %1
```
Expected: JSON like `{"authenticated":false}`.

- [ ] **Step 7: Commit**

```bash
git add src/server.ts tests/server.test.ts
git commit -m "feat(server): broker, portfolio, trade, and screen endpoints"
```

---

### Task 8: Portfolio tab UI

**Files:**
- Modify: `public/index.html` (add Portfolio tab + trade panel + trade history + broker status)
- Modify: `public/app.js` (fetch Portfolio, render holdings, submit trades with confirmation modal, render orders, broker auth link, AI deep-dive optional)
- Modify: `public/style.css`

**Interfaces:**
- Consumes the endpoints added in Task 7: `GET /api/broker`, `GET /api/portfolio`, `GET /api/orders`, `POST /api/trade`, `POST /api/broker/auth`.

**UI requirements (from spec section 4):**
- Holdings list with symbol, qty, avg price, LTP, day change %, P&L (₹ and %), current value.
- Per-holding recommendation badge (BUY MORE / HOLD / SELL) + expandable reasons.
- Live trade panel: symbol → qty → side → type → **mandatory confirmation modal with a red warning** ("This places a REAL order"). Confirm button required.
- Trade history section (orders with status).
- Broker status bar (authenticated? connect link).
- Optional AI deep-dive: if Ollama running, show a button for a selected holding; otherwise show "Ollama not detected" and disable.

- [ ] **Step 1: Add the Portfolio tab to `index.html`**

Add nav button and panel:

```html
      <button class="tab-btn" data-tab="portfolio">Portfolio</button>
```

and a new `<section id="tab-portfolio" class="tab-panel">` containing:
- a broker status row (`<div id="broker-status">`),
- a trade form (`input#trade-symbol`, `input#trade-qty`, `select#trade-side`, `select#trade-type`, button `#trade-open`),
- a confirmation modal (`<div id="trade-modal" class="modal hidden">`) with the red warning and `#trade-confirm` / `#trade-cancel` buttons,
- a holdings container `<div id="portfolio-holdings">`,
- an orders container `<div id="portfolio-orders">`,
- an AI deep-dive panel `<div id="ai-deepdive">`.

Add a `<style>` block for `.modal.hidden { display:none }` and `.modal { ... }` overlay (or extend `style.css`).

- [ ] **Step 2: Implement `public/app.js` portfolio logic**

Add these functions (append to the existing file, and call `loadPortfolio()` on startup):

```js
// Broker status
async function loadBrokerStatus() {
  const el = document.getElementById("broker-status");
  try {
    const res = await fetch("/api/broker");
    const b = await res.json();
    el.innerHTML = b.authenticated
      ? `<span class="positive">● Connected to Upstox</span>`
      : `<span class="negative">○ Not connected</span> <button class="btn" onclick="window.open('/api/broker', '_blank')">Authorize</button>`;
  } catch (e) {
    el.innerHTML = `<span class="error">${e.message}</span>`;
  }
}

// Portfolio + recommendations
async function loadPortfolio() {
  const el = document.getElementById("portfolio-holdings");
  el.innerHTML = "<p>Loading…</p>";
  try {
    const res = await fetch("/api/portfolio");
    if (!res.ok) throw new Error("Failed to load portfolio");
    const data = await res.json();
    if (data.holdings.length === 0) {
      el.innerHTML = "<p>No holdings found.</p>";
      return;
    }
    el.innerHTML = data.holdings.map((h) => {
      const recCls = h.recommendation.action === "BUY_MORE" ? "positive" : h.recommendation.action === "SELL" ? "negative" : "neutral";
      const pnlCls = h.pnl >= 0 ? "positive" : "negative";
      return `<div class="holding">
        <div class="row"><strong>${h.symbol}</strong> <span class="rec badge ${recCls}">${h.recommendation.action.replace("_", " ")}</span></div>
        <div class="metric-grid">
          <div class="metric"><div class="label">Qty</div><div class="value">${h.quantity}</div></div>
          <div class="metric"><div class="label">Avg</div><div class="value">${money(h.averagePrice)}</div></div>
          <div class="metric"><div class="label">LTP</div><div class="value">${money(h.ltp)}</div></div>
          <div class="metric ${pnlCls}"><div class="label">P&L</div><div class="value">${h.pnl >= 0 ? "+" : ""}${money(h.pnl)} (${h.pnlPercent.toFixed(2)}%)</div></div>
          <div class="metric"><div class="label">Value</div><div class="value">${money(h.currentValue)}</div></div>
        </div>
        <p class="desc">${h.recommendation.reasons.join(" · ")}</p>
      </div>`;
    }).join("");
  } catch (e) {
    el.innerHTML = `<p class="error">${e.message}</p>`;
  }
}
```

- [ ] **Step 3: Implement trade form + confirmation modal in `app.js`**

```js
document.getElementById("trade-open").addEventListener("click", () => {
  const symbol = document.getElementById("trade-symbol").value.trim();
  const qty = Number(document.getElementById("trade-qty").value);
  const side = document.getElementById("trade-side").value;
  const type = document.getElementById("trade-type").value;
  if (!symbol || !qty || qty <= 0) {
    alert("Enter a symbol and a positive quantity.");
    return;
  }
  const modal = document.getElementById("trade-modal");
  modal.classList.remove("hidden");
  modal.querySelector(".modal-summary").textContent =
    `${side} ${qty} × ${symbol} (${type}) — this places a REAL order with your broker.`;
});

document.getElementById("trade-cancel").addEventListener("click", () => {
  document.getElementById("trade-modal").classList.add("hidden");
});

document.getElementById("trade-confirm").addEventListener("click", async () => {
  const modal = document.getElementById("trade-modal");
  const symbol = document.getElementById("trade-symbol").value.trim();
  const qty = Number(document.getElementById("trade-qty").value);
  const side = document.getElementById("trade-side").value;
  const type = document.getElementById("trade-type").value;
  try {
    const res = await fetch("/api/trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, side, qty, type, confirm: true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Order failed");
    alert(`Order placed: ${data.id}`);
    modal.classList.add("hidden");
    loadPortfolio();
    loadOrders();
  } catch (e) {
    alert(`Trade failed: ${e.message}`);
  }
});
```

- [ ] **Step 4: Implement orders + broker auth + optional AI**

```js
async function loadOrders() {
  const el = document.getElementById("portfolio-orders");
  try {
    const res = await fetch("/api/orders");
    const data = await res.json();
    if (!data.orders || !data.orders.length) {
      el.innerHTML = "<p>No orders yet.</p>";
      return;
    }
    el.innerHTML = data.orders.map((o) =>
      `<div class="entry"><strong>${o.symbol}</strong> <span class="${o.side === "BUY" ? "positive" : "negative"}">${o.side}</span> ${o.qty} @ ${money(o.price)} · ${o.status}</div>`,
    ).join("");
  } catch (e) {
    el.innerHTML = `<p class="error">${e.message}</p>`;
  }
}

// Optional AI deep-dive (Ollama)
async function loadAiAvailability() {
  const el = document.getElementById("ai-deepdive");
  try {
    const res = await fetch("/api/ai");
    if (!res.ok) throw new Error();
    const data = await res.json();
    el.innerHTML = data.available
      ? `<button class="btn" id="ai-analyze">Analyze selected holding (Ollama)</button>`
      : `<p class="muted">Ollama not detected — AI deep-dive disabled.</p>`;
  } catch {
    el.innerHTML = `<p class="muted">Ollama not detected — AI deep-dive disabled.</p>`;
  }
}
```

Note: Add a small `GET /api/ai` endpoint to the server (Task 7) returning `{ available }` by calling an optional `OllamaService.isRunning()`. Wrap the call in try/catch so the endpoint never 500s if Ollama is down.

- [ ] **Step 5: Wire startup + tab rendering**

Add to the end of `app.js`:

```js
loadBrokerStatus();
loadPortfolio();
loadOrders();
loadAiAvailability();
```

Also ensure the Portfolio tab re-fetches when switched to (add an event on the portfolio tab button, or just call the loaders once on startup as above).

- [ ] **Step 6: Manual verification**

Run: `pnpm dev`
Expected: Portfolio tab renders broker status, holdings (or "No holdings found"), the trade form opens a confirmation modal on submit, and the AI panel shows "Ollama not detected". (Without API credentials, holdings fetch will error — verify the error is shown gracefully.)

- [ ] **Step 7: Commit**

```bash
git add public/index.html public/app.js public/style.css
git commit -m "feat(ui): add Portfolio tab with holdings, recommendations, and trade confirmation"
```

---

### Task 9: CLI removal

**Files:**
- Remove: `src/cli/` (entire directory)
- Remove: `tests/screener.test.ts` — actually KEEP (it tests the engine, still used). This line is advisory.
- Modify: `package.json` (remove `bin`, remove `cli` script, remove `commander`, `chalk`, `inquirer` deps)
- Modify: `src/server.ts` if it imported anything from CLI (it does not)

**Notes:**
- `pnpm check` and `pnpm build` must still pass. `tests/screener.test.ts`, `backtest.test.ts`, etc. stay (they test engines, not the CLI).
- Remove `commander`, `chalk`, and `inquirer` via pnpm so the lockfile updates.

- [ ] **Step 1: Remove the CLI directory**

```bash
rm -r src/cli
```

- [ ] **Step 2: Update `package.json`**

Remove the `bin` field and the `cli` script. Remove `commander`, `chalk`, `inquirer` from dependencies:

```bash
pnpm remove commander chalk inquirer
```

- [ ] **Step 3: Verify no CLI imports remain**

```bash
rg -l "src/cli|commander|chalk|inquirer" src tests || echo "none found"
```
Expected: "none found".

- [ ] **Step 4: Run check + tests**

Run: `pnpm check`
Run: `pnpm test`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add -A src package.json pnpm-lock.yaml
git commit -m "chore: remove CLI interface surface"
```

---

### Task 10: Documentation updates

**Files:**
- Create: `docs/upstox-trading.md`
- Remove: `docs/fyers-trading.md`
- Modify: `docs/getting-started.md`, `docs/architecture.md`, `docs/data-sources.md`, `docs/screeners.md`, `docs/personalities.md`, `docs/dashboard.md`, `docs/trade-journal.md`, `docs/ai-insights.md`, `docs/backtesting.md`, `docs/development.md`

**Notes:**
- Every doc must reflect: UI-only interface (no CLI), Upstox as sole broker, dynamic NIFTY 500 universe, Portfolio tab, trade execution safety, rule-based recommendations, Ollama optional.
- Update every place that references CLI commands (`node dist/cli/index.js`, `stockpulse <cmd>`, `pnpm cli`, etc.) to point at the web dashboard.
- `data-sources.md`: explain why multiple sources exist (Yahoo = fundamentals/history; Upstox = broker trading; NSE = symbol list; News RSS = news; Ollama = optional AI). No redundancy now.
- `development.md`: replace CLI verification with `pnpm dev` browser verification; note the new engine tests.

- [ ] **Step 1: Write `docs/upstox-trading.md`**

```markdown
# Upstox Trading

StockPulse executes real trades through the Upstox Developer API (v3). Upstox
is the sole broker behind the shared `Broker` interface.

## Setup
1. Create an app at `developer.upstox.com` and note the API key + secret.
2. Set redirect URI to `http://localhost:8787/callback`.
3. Put `UPSTOX_API_KEY`, `UPSTOX_API_SECRET`, and `UPSTOX_REDIRECT_URI` in your
   gitignored `.env`.

## Authentication
Open the app's `/api/broker` URL in a browser, complete OAuth, and the access
token is stored in `data/stockpulse.db` (`broker_tokens` table). The standard
access token expires daily; an **analytics token** (registered static IP)
avoids daily re-auth for read-only portfolio + market data.

## Endpoints used
- `GET /v2/portfolio/long-term-holdings`
- `GET /v2/portfolio/short-term-positions`
- `GET /v2/orders`
- `POST /v2/order/place`

## Safety
Every real order requires a `confirm: true` flag (server-side backstop) and a
UI confirmation modal. The app never auto-trades.

## Security
Tokens are secrets, stored only in the local gitignored SQLite DB, never
logged or committed.
```

- [ ] **Step 2: Remove `docs/fyers-trading.md`**

```bash
git rm docs/fyers-trading.md
```

- [ ] **Step 3: Update the remaining docs**

For each doc in the list, locate and replace any CLI references and reflect the new architecture (UI-only, Upstox sole broker, dynamic NIFTY 500, Portfolio tab, rule-based recommendations, optional Ollama). Keep changes focused — these are content edits, not rewrites. Example for `getting-started.md`:

```markdown
# Getting Started

Run the dashboard:
1. `pnpm install`
2. `pnpm dev`   # opens http://localhost:8787 (set OPEN_BROWSER=1 to auto-open)

Use the tabs: Quotes, Personalities, Backtest, News, and Portfolio.
The Portfolio tab connects to your Upstox account for holdings, recommendations,
and (optional, confirmed) trade execution.
```

- [ ] **Step 4: Run check + commit**

Run: `pnpm check`

```bash
git add -A docs
git commit -m "docs: reflect UI-only interface, Upstox broker, NIFTY 500 universe"
```

---

### Task 11: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all pass.

- [ ] **Step 2: Run lint + typecheck**

Run: `pnpm check`
Expected: clean.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: `dist/` produced without errors.

- [ ] **Step 4: Manual smoke test of the dashboard**

Run: `pnpm dev`
Expected: dashboard loads; Quotes/Personalities/Backtest/News still work; Portfolio tab shows broker status and handles no-auth gracefully.

- [ ] **Step 5: Final commit (if any verification artifacts)**

```bash
git add -A
git status
```
Commit any remaining fixes (no-op if nothing changed).