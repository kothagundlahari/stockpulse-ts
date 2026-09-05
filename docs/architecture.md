# Architecture

StockPulse is deliberately simple. It avoids the multi-layered service/view-model architecture of the original Swift app in favor of a clean, testable separation.

## High-level structure

```
┌─────────────────────────────────────────────┐
│          Web Dashboard (public/)            │
│   HTML / CSS / JS — no build step           │
├─────────────────────────────────────────────┤
│            Server (src/server.ts)           │
│   HTTP routing, JSON API, static serving    │
├─────────────────────────────────────────────┤
│               Engines (pure logic)          │
│   screener │ backtest │ holding-recommendation
├─────────────────────────────────────────────┤
│            Services (integrations)          │
│   yahoo-finance │ upstox │ ollama │ news    │
│   database │ broker-types                   │
├─────────────────────────────────────────────┤
│              Types (Zod schema)             │
│   src/types/                                │
└─────────────────────────────────────────────┘
```

## Layer responsibilities

### 1. Web Dashboard (`public/`)
- Plain HTML/CSS/JS served by the Node server — no build step, no framework.
- Tabs: Quotes, Personalities, Backtest, News, Portfolio.
- The Portfolio tab shows holdings with live P&L, per-holding recommendations, a trade panel with confirmation modal, and trade history.

### 2. Server (`src/server.ts`)
- Raw Node `http` server — no Express or other framework.
- Handles JSON API routing, request body parsing, static file serving.
- Calls into engines and services for all data operations.

### 3. Engines (`src/engines/`)
Pure, dependency-free business logic:
- **`screener.ts`** — filters a list of stocks by criteria (used by `GET /api/screen`)
- **`backtest.ts`** — runs a strategy over price history (used by `GET /api/backtest`)
- **`holding-recommendation.ts`** — rule-based BUY_MORE / HOLD / SELL recommendations per holding, using fundamentals and price signals

These are the most heavily tested components. They take plain data in, return plain data out, and have no side effects.

### 4. Services (`src/services/`)
Everything that talks to the outside world:
- **`yahoo-finance.ts`** — live quotes, historical prices, fundamentals, search
- **`upstox.ts`** — Upstox broker API: OAuth auth, holdings, positions, orders, trade placement
- **`broker.ts`** — Upstox client factory (`getUpstoxClient`) and OAuth completion (`connectUpstox`)
- **`broker-types.ts`** — shared types: `Broker`, `Holding`, `Position`, `Order`, `PlaceOrderParams`
- **`ollama.ts`** — local AI chat completions (optional)
- **`news.ts`** — RSS fetching/parsing
- **`database.ts`** — SQLite persistence (broker tokens and fundamentals cache)

Services are thin wrappers around external APIs. Validation happens at the boundary (see below).

### 5. Types (`src/types/`)
Every shared data shape is a **Zod schema** with an inferred TypeScript type:

```ts
const StockSchema = z.object({
  symbol: z.string().min(1),
  name: z.string().min(1),
  exchange: z.enum(["NSE", "BSE"]),
});
type Stock = z.infer<typeof StockSchema>;
```

This gives you **runtime validation + compile-time safety at no extra cost** — a cleaner alternative to hand-written interfaces or full ORMs.

## Dynamic NIFTY 500 universe

The screener and personality filters operate over a **dynamic NIFTY 500 universe** (`src/data/nifty500.ts`). Symbol lists are fetched live from the NSE index constituents CSV (`ind_nifty500list.csv`), and per-symbol fundamentals are fetched from Yahoo Finance with a 30-minute cache (24-hour symbol list cache). There is no hardcoded stock data.

## Broker layer

Upstox is the sole broker, implemented behind a shared `Broker` interface (`src/services/broker-types.ts`). The `UpstoxClient` (`src/services/upstox.ts`) implements OAuth 2.0 authorization-code flow, holdings/positions/orders retrieval, and trade placement. The `Broker` interface is broker-agnostic, so additional brokers can be added later with minimal cost.

Access tokens are persisted in the SQLite `broker_tokens` table and never committed or logged.

## Holding recommendation engine

The holding recommendation engine (`src/engines/holding-recommendation.ts`) is pure logic with no I/O. It evaluates each holding against:

- **Valuation** — P/E ratio relative to a reasonable band
- **Momentum** — current price vs 10-day and 50-day SMAs
- **Fundamentals** — ROE, debt-to-equity, revenue growth
- **Portfolio concentration** — single holding exceeding a configurable weight threshold

It returns a `BUY_MORE`, `HOLD`, or `SELL` recommendation with a confidence level and human-readable reasons.

## Design decisions (and what we deliberately removed)

The original Swift app followed MVVM with `AppState`, `OllamaStatus` enums, notification observation, and a `Knowledge/` git-sync layer. This rebuild removes redundancy:

- **No global mutable state** — server endpoints are stateless; everything is passed explicitly
- **No ViewModel layer** — the web dashboard is plain HTML/CSS/JS
- **No separate "models" and "services" folders for pure types** — all types live in one place
- **No git-tracked knowledge mirror** — SQLite is the single source of truth; simpler and no sync bugs
- **No event bus / notification maintenance tasks** — replaced by simple awaits and dependency injection
- **No CLI** — the web dashboard is the only interface

## Concurrency

The server handles requests asynchronously via `async/await`. Engines are pure functions, which makes them trivially parallelizable later if needed. There is no shared mutable state, so no locks or actors are required.

## Adding a new feature

1. Define the data shape in `src/types/`
2. Write a failing test in `tests/`
3. Implement the logic (engine or service) until the test passes
4. Add the server endpoint in `src/server.ts`
5. Add the UI tab/panel in `public/`
6. Document it in `docs/`

See the [Development Guide](development.md) for the full TDD workflow.
