# Architecture

StockPulse is deliberately simple. It avoids the multi-layered service/view-model architecture of the original Swift app in favor of a clean, testable separation.

## High-level structure

```
┌─────────────────────────────────────────────┐
│          Web Dashboard (public/)            │
│   HTML / CSS / JS — no build step           │
├─────────────────────────────────────────────┤
│            Server (src/server.ts)           │
│   HTTP transport: routing, JSON, static     │
├─────────────────────────────────────────────┤
│               Engines (pure logic)          │
│   screener │ backtest │ holding-recommendation
│   assemblePortfolio                         │
├─────────────────────────────────────────────┤
│            Services (integrations)          │
│   yahoo-finance │ upstox │ in-memory-broker │
│   broker factory │ portfolio intake         │
│   database │ news │ ollama                  │
├─────────────────────────────────────────────┤
│              Types (Zod schema)             │
│   src/types/                                │
└─────────────────────────────────────────────┘
```

## Layer responsibilities

### 1. Web Dashboard (`public/`)
- Plain HTML/CSS/JS served by the Node server — no build step, no framework.
- Tabs: Quotes, Personalities, Backtest, News, Portfolio.
- The Portfolio tab shows holdings with live P&L, per-holding Recommendations, an order panel with confirmation modal, and order history.

### 2. Server (`src/server.ts`)
- Raw Node `http`/`https` server — no Express or other framework.
- Transport only: method/path matching, security headers, body-size limits, symbol validation, JSON serialization.
- Delegates domain work to engines and services (`Screener`, `loadPortfolio`, `BacktestEngine.runDefault`, `getBroker`).

### 3. Engines (`src/engines/`)
Pure business logic, no I/O:
- **`screener.ts`** — Criteria runs (`runCriteria`) return Fundamentals of passing Universe members; Personality runs (`runPersonality`, `runAllPersonalities`) emit Candidates
- **`personality-ranker.ts`** — sector-median benchmarks and ranked Personality scores
- **`backtest.ts`** — strategy over price history (`GET /api/backtest`); emits Round-trips, never Orders
- **`holding-recommendation.ts`** — advisory BUY_MORE / HOLD / SELL on an existing Holding
- **`portfolio.ts`** — `assemblePortfolio`: weights and Recommendations from already-resolved observations

These take plain data in, return plain data out, and have no side effects.

### 4. Services (`src/services/`)
Everything that talks to the outside world or holds session state:
- **`yahoo-finance.ts`** — live quotes, historical prices, Fundamentals
- **`upstox.ts`** — live Broker adapter: OAuth, holdings, positions, orders, order placement
- **`in-memory-broker.ts`** — in-process Broker adapter for tests and offline work
- **`broker.ts`** — `getBroker` / `setBroker`, live-adapter OAuth (`connectUpstox` / `disconnectUpstox`)
- **`broker-types.ts`** — `Broker`, `Holding`, `Position`, `Order`, `PlaceOrderParams`
- **`portfolio.ts`** — `loadPortfolio`: holdings + cache-fresh Fundamentals + price history, then `assemblePortfolio`
- **`database.ts`** — SQLite: Broker session persistence and `getFreshFundamentals` / `getAllFreshFundamentals` (24h TTL inside the store)
- **`ollama.ts`** — local AI availability (optional)
- **`news.ts`** — RSS fetching/parsing

### 5. Types (`src/types/`)
Every shared data shape is a **Zod schema** with an inferred TypeScript type. Validate at external I/O boundaries.

## Dynamic NIFTY 500 Universe

Screener and Personality runs operate over a **dynamic Universe** (`src/data/nifty500.ts`). Symbols come from the NSE index CSV (`ind_nifty500list.csv`). Per-symbol Fundamentals come from Yahoo Finance. Freshness is evaluated inside `DatabaseService` (default 24 hours). There is no hardcoded Universe roster.

## Broker seam

The rest of the app depends on the `Broker` abstraction (`src/services/broker-types.ts`), not on Upstox. Two adapters satisfy the seam:

- **`UpstoxClient`** — live production adapter
- **`InMemoryBroker`** — deterministic in-process adapter (ADR-0001 `confirm: true` gate included)

`getBroker()` returns the active `Broker`. OAuth for the live adapter is `connectUpstox` / `disconnectUpstox`. Access tokens are persisted in SQLite `broker_tokens` and never committed or logged.

## Portfolio intake and holding Recommendations

`loadPortfolio` (service) fetches holdings from any Broker adapter, resolves cache-fresh Fundamentals, loads price history, then calls pure `assemblePortfolio`. Recommendations stay advisory: they never become an `Order` without an explicit confirmed order request (ADR-0001).

## Design decisions (and what we deliberately removed)

The original Swift app followed MVVM with `AppState`, `OllamaStatus` enums, notification observation, and a `Knowledge/` git-sync layer. This rebuild removes redundancy:

- **No global mutable state** — server endpoints are stateless; everything is passed explicitly
- **No ViewModel layer** — the web dashboard is plain HTML/CSS/JS
- **No git-tracked knowledge mirror** — SQLite is the single source of truth
- **No CLI** — the web dashboard is the only interface

## Adding a new feature

1. Define the data shape in `src/types/`
2. Write a failing test in `tests/`
3. Implement the logic (engine or service) until the test passes
4. Add the server endpoint in `src/server.ts` as a thin dispatch
5. Add the UI tab/panel in `public/`
6. Document it in `docs/`

See the [Development Guide](development.md) for the full TDD workflow.
