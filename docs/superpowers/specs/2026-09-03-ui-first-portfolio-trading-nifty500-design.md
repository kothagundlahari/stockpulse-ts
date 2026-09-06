# StockPulse: UI-First Portfolio, Trading & NIFTY 500 — Design

Date: 2026-09-03
Status: Draft for review

## Background

StockPulse is a TypeScript stock-research tool. Today it is a CLI-first app
with a supplementary web dashboard. The user wants to:

1. See their live broker holdings (via Upstox) with P&L in the UI.
2. Get rule-based recommendations (buy more / hold / sell) for stocks already
   in their portfolio.
3. Execute real trades from the UI, with tracked history.
4. Remove the CLI entirely — the web UI becomes the only interface.
5. Support a NIFTY 500 screener universe with **no hardcoded data**
   (currently limited to ~49 hand-entered NIFTY 50 rows).
6. Keep Ollama as an optional, additive feature (never a blocker).

## Current-State Findings

- `src/services/kite-connect.ts` is a fully built but **dead** service — never
  imported by the CLI or server. It can authenticate and place orders but has
  no holdings/positions/trade-history methods.
- `src/services/fyers.ts` is wired through the CLI `auth` command only.
  `placeOrder` exists but is never called from any command or endpoint.
- **Research found Upstox is the best broker for this app** — free API (vs
  Kite's ~₹2000/mo and FYERS' paid realtime data), OAuth 2.0 authorization-code
  flow (same shape as the existing FYERS/Kite clients), native holdings/
  positions/orders endpoints, a full sandbox, and an **Analytics Token** that
  avoids daily re-auth for market data and read-only portfolio. FYERS adds no
  capability Upstox lacks for this single-user, manual-trading app.
  **Both Kite and FYERS are therefore removed; Upstox is the sole broker.**
- Neither existing broker exposes holdings/positions or trade history — the
  critical gap for the portfolio view.
- Trade tracking is provided by broker order history in the Portfolio view; the
  removed manual SQLite journal is no longer part of the current application.
- The screener universe is hardcoded in `src/data/nifty50.ts` (~49 static
  fundamentals rows). `getLiveNifty50Fundamentals` fetches live data for those
  same ~49 symbols and merges over the static snapshot.
- Ollama (`src/services/ollama.ts`) produces free-text per-symbol insights,
  only reachable via the CLI `insight` command.
- The web dashboard (`src/server.ts` + `public/`) is read-only and has no
  holdings, trading, screeners, or AI tabs.

## Goals

- Dynamic NIFTY 500 screener universe, sourced live (no hardcoded data).
- **Unified broker layer** so Upstox is the sole broker, exposed through a
  shared `Broker` interface so more brokers can be added later with minimal
  cost.
- Portfolio/holdings view with live P&L and per-holding recommendations.
- Mandatory-safeguard trade execution in the UI.
- Remove the CLI as an interface surface.
- Update all docs to reflect the new state.

## Non-Goals

- No new cloud AI service. Ollama remains local-only and optional.
- No auto-trading / algorithmic execution. All trades are user-initiated with
  confirmation.
- No BSE support beyond what brokers already expose.

---

## 1. Dynamic NIFTY 500 Universe (no hardcoding)

**New file `src/data/nifty500.ts`** — replaces the hardcoded static universe as
the data source.

- **Symbol list**: fetched live from the official NSE index constituents CSV at
  fetch time. Primary source: NSE. Fallback: Yahoo Finance `search`.
- **Fundamentals**: fetched per-symbol from Yahoo Finance `getFundamentals`
  using the existing concurrent batch pattern (`mapWithConcurrency` in
  `src/data/live-nifty50.ts`), with a result cache.
- **No hardcoded static rows**: remove the hand-entered fundamentals from
  `src/data/nifty50.ts`. If a field is unavailable for a symbol it is omitted
  (screener already treats missing fields as failing the criterion — see
  `docs/screeners.md`).
- **Cache**: fundamentals cached with a configurable TTL (default 30 min) to
  keep the ~500-symbol fetch from hammering Yahoo. Symbol list cached longer
  (e.g. 24 h).
- **Concurrency & rate limits**: reuse the bounded concurrency worker; symbols
  that fail fetch are skipped, not fatal.

### Personality filters

The 8 personality filters (Buffett, Munger, Lynch, Graham, Greenblatt, Klarman,
Dividend Growth, Growth Momentum) are **logic, not data**. They are retained and
made to operate across the full dynamic NIFTY 500 universe. The static
fundamentals rows in `nifty50.ts` are deleted; the filter definitions remain
(moved to the new universe module or kept in a renamed file).

### Impact on `src/data/nifty50.ts`

- Static `Fundamentals[]` array removed.
- `NIFTY50` export removed or converted to export only the personality filter
  definitions.
- `getLiveNifty50Fundamentals` / `mergeFundamentals` in
  `src/data/live-nifty50.ts` reworked to drive from the dynamic NIFTY 500
  source.

## 2. Broker Layer & Holdings/Positions

**Broker choice (researched):** Upstox is the **sole broker**. Versus Kite,
Upstox is free (Kite is ~₹2000/mo); versus FYERS, Upstox adds native holdings/
positions/orders endpoints, a full sandbox, and an **Analytics Token** that
avoids daily re-auth for market data and read-only portfolio access. For this
single-user, manual-trading app, neither Kite nor FYERS adds capability Upstox
lacks, so both are **removed**. Implementing Upstox behind a shared `Broker`
interface keeps the option of adding more brokers cheap later.

**New `src/services/broker-types.ts`** — shared types:

```ts
interface Holding {
  symbol: string
  quantity: number
  averagePrice: number
  ltp: number
  pnl: number
  pnlPercent: number
  dayChange: number
  dayChangePercent: number
  currentValue: number
}

interface Position {
  symbol: string
  quantity: number
  averagePrice: number
  ltp: number
  pnl: number
}

interface Order {
  id: string
  symbol: string
  side: "BUY" | "SELL"
  qty: number
  price: number
  status: string
  timestamp: string
}

interface PlaceOrderParams {
  symbol: string
  qty: number
  side: "BUY" | "SELL"
  type: "LIMIT" | "MARKET"
  limitPrice?: number
}
```

**New `src/services/broker.ts`** — a `Broker` interface + factory:

```ts
interface Broker {
  readonly name: "upstox"
  isAuthenticated: boolean
  getAuthUrl(): string
  authenticate(code: string): Promise<void>
  getHoldings(): Promise<Holding[]>
  getPositions(): Promise<Position[]>
  getOrders(): Promise<Order[]>
  placeOrder(params: PlaceOrderParams & { confirm: true }): Promise<{ id: string }>
}

function getBroker(): Broker
```

The new `UpstoxClient` (new file `src/services/upstox.ts`) implements `Broker`.
The interface is kept broker-agnostic (a `name` string, not a union literal) so
additional brokers can implement it later.

### Upstox service

**New `src/services/upstox.ts`** — `UpstoxClient` implementing `Broker` via the
Upstox Developer API v3 (REST OAuth2 + Node.js SDK):

- `getAuthUrl()` / `authenticate(code)` — OAuth 2.0 authorization-code flow.
- `getHoldings()` — `/portfolio/long-term-holdings`.
- `getPositions()` — `/portfolio/short-term-positions`.
- `getOrders()` — `/orders`.
- `placeOrder()` — `/order/place` (market/limit), requiring `confirm: true`.
- **Analytics Token** for market-data + read-only portfolio endpoints where
  supported, avoiding daily re-auth.

### Removed services and deps

- **Remove `src/services/kite-connect.ts`** and the `kiteconnect` dependency
  (redundant to Upstox).
- **Remove `src/services/fyers.ts`** and its usage (no longer needed; Upstox
  covers the same capabilities with OAuth + sandbox + analytics token).
  Drop `docs/fyers-trading.md`.

### Token persistence

Currently tokens are in-memory and lost on restart. Add a SQLite
`broker_tokens` table (in the existing `data/stockpulse.db`) storing the
Upstox access token so the dashboard shows holdings without a re-login each
restart.

- Upstox: standard access token expires daily; the **Analytics Token** (read-
  only portfolio + market data) avoids daily re-auth where the user has a
  registered static IP. Persist both.
- Tokens are secrets; stored in the local gitignored DB only, never logged or
  committed.

## 3. Rule-Based Recommendation Engine

**New `src/engines/holding-recommendation.ts`** — pure logic, no I/O.

```ts
interface Recommendation {
  action: "BUY_MORE" | "HOLD" | "SELL"
  confidence: "low" | "medium" | "high"
  reasons: string[]
}

function recommendHolding(
  holding: Holding,
  fundamentals: Fundamentals | undefined,
  price: { current: number; sma10: number; sma50: number; },
  portfolioWeightPct: number,
): Recommendation
```

Signals:

- **Valuation** — P/E vs a reasonable band; margin of safety from the price.
- **Momentum** — current price vs SMA10 / SMA50.
- **Fundamentals** — ROE, debt/equity, revenue growth.
- **Portfolio concentration** — if a single holding exceeds a configurable
  weight threshold → SELL/trim; if underweight and attractive → BUY_MORE.

Data comes from Yahoo Finance per held symbol (fundamentals + historical
prices). Works for any held stock — no dependency on the NIFTY 500 universe.

**No Ollama dependency.** This engine is deterministic and offline.

## 4. UI: Portfolio Tab

Located in `public/` (`index.html`, `app.js`, `style.css`). Add a Portfolio tab.

- **Holdings list**: symbol, quantity, average price, LTP, day change,
  day-change %, P&L (₹ and %), current value.
- **Recommendation badge** per holding (BUY MORE / HOLD / SELL) and a
  "details" expansion showing rule reasons.
- **Live trade panel**: symbol search → quantity → side → order type →
  **confirmation modal with red warning** ("This places a REAL order with your
  broker"). User must click an explicit confirm button.
- **Trade history** section: recent broker orders with status.
- **Broker status** at top: shows whether Upstox is authenticated (with a
  connect/re-auth action). No broker switcher needed with a single broker.
- **Optional AI deep-dive** panel: if Ollama is running, show a free-text
  analysis for a selected holding; if not, show "Ollama not detected" and
  disable the pane without affecting anything else.

## 5. Server API (`src/server.ts`)

Add endpoints (server currently only handles GET; add POST body parsing):

- `GET /api/broker` — Upstox auth status and its auth URL.
- `GET /api/portfolio` — holdings merged with live quotes and per-holding
  recommendations.
- `GET /api/orders` — recent orders/trade history.
- `POST /api/trade` — place a real order. Body: `{ symbol, side, qty, type,
  limitPrice?, confirm: true }`. **Reject if `confirm !== true`** (a
  server-side backstop to the UI confirmation).
- `POST /api/broker/auth` — complete OAuth (accept auth code, store tokens).

Existing endpoints (`/api/quote`, `/api/personalities`, `/api/backtest`) remain.

`/api/personalities` re-points to the dynamic NIFTY 500 universe.

Add `GET /api/screen` — runs the existing `ScreenerEngine` over the dynamic
NIFTY 500 universe with query-param criteria (this replaces the CLI `screen`
stub, which is removed along with the CLI).

## 6. CLI Removal

- Delete `src/cli/` entirely.
- Remove `bin` from `package.json`.
- Remove the `cli` script (`tsx src/cli/index.ts`).
- Remove now-unused dependencies: `commander`, `chalk`, `inquirer`.
- The web server (`pnpm dev` / `pnpm dev:server`) becomes the only entry point.

## 7. Documentation Updates

Update all docs to the UI-first state:

- `getting-started.md` — remove CLI commands; document starting the dashboard.
- `architecture.md` — add broker layer, dynamic universe, holding
  recommendation engine.
- `data-sources.md` — document Upstox (sole broker), NSE index CSV, Yahoo;
  clarify why multiple sources are used.
- `screeners.md` — NIFTY 500 dynamic universe; remove "stub" note.
- `personalities.md` — 8 filters across full dynamic NIFTY 500.
- `dashboard.md` — Portfolio tab, trade execution, safety confirmation, POST
  endpoints.
- `trade-journal.md` — broker trade history alongside the manual journal.
- `ai-insights.md` — Ollama now optional UI deep-dive; not core.
- `backtesting.md` — largely unchanged (engine untouched); update any CLI
  references.
- `development.md` — update verification steps (no CLI), add new engine tests.
- **Remove** `docs/fyers-trading.md` (no longer relevant — FYERS removed).
- **Add** `docs/upstox-trading.md` (OAuth setup, holdings/orders endpoints,
  analytics token, safety/security notes).

## Testing

- **Unit (vitest)**: holding recommendation engine, NIFTY 500 universe parsing,
  broker-type normalization, HTTP route validation.
- **Pure logic in engines** remains the most-tested layer.
- `pnpm check` (biome + tsc) after each change.
- `pnpm test` for the full suite.
- Manual `pnpm dev` browser verification of Portfolio, trading confirmation,
  and broker auth flows.

## Out of Scope / Follow-ups

- Auto-trading / scheduled execution.
- Cloud AI services.
- BSE-specific trading beyond broker defaults.
- Mobile app.

## Open Questions / Decisions Log

- NIFTY 500 symbol source → **NSE index CSV**, Yahoo fallback. (decided)
- Broker strategy → **Upstox sole broker** behind a shared `Broker` interface;
  Kite and FYERS **removed**. (decided via spike research)
- Trade safety → **Confirm + warn** in UI, `confirm: true` server backstop. (decided)
- Skill history → **Broker history + manual journal** both shown. (decided)
- Recommendation engine → **Rule-based** (no Ollama). (decided)
- Ollama → **Optional additive** deep-dive only. (decided)
- Personality filters → **Keep all 8** across full NIFTY 500. (decided)
- Scope → **Full vision** in one change. (decided)
