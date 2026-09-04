# StockPulse

**A TypeScript web dashboard for Indian stock research** — a UI-first rebuild of the original native Swift `researchTool`, with clean architecture, strict typing, and TDD.

## Why a TypeScript rebuild?

The original project was a native macOS SwiftUI app. This rebuild:

- **Is a web dashboard, not a CLI** — the browser is the only interface; a local HTTP server serves the UI and a JSON API
- **Is cross-platform** — runs anywhere Node.js does, not just macOS
- **Uses TDD** — every engine and service is covered by tests written before implementation
- **Applies practical standards** — Zod validation at every external boundary, strict TypeScript with no `any`, no unnecessary abstraction

## Quick Start

```bash
# Install (better-sqlite3 + esbuild need allowBuilds)
pnpm install

# Run the web dashboard (opens in the browser; PORT env overrides, default 8787)
pnpm dev

# Or run it headless, then open http://localhost:8787 manually
pnpm dev:server
```

Other commands:

```bash
pnpm build   # tsc → dist/ (no bundler; rebuild before smoke-testing node dist/server.js)
pnpm test    # vitest run (all suites)
pnpm check   # biome lint/format check + tsc --noEmit
node dist/server.js   # run the built server (after pnpm build)
```

## Features

| Feature | Status | Description |
|---|---|---|
| NIFTY 500 universe | ✅ | Symbol list fetched live from the NSE index CSV; per-symbol fundamentals from Yahoo, cached |
| Personality screeners | ✅ | 8 classic investor personalities over the NIFTY 50 |
| Screener | ✅ | Filterable by market cap, PE, PB, ROE, debt/equity, revenue growth, dividend yield |
| Live quotes & charts | ✅ | Yahoo Finance chart endpoint, NSE symbols |
| Backtesting | ✅ | SMA crossover / buy-and-hold, no look-ahead bias |
| Holding recommendations | ✅ | Buy/hold/sell guidance for existing positions |
| Trade journal | ✅ | SQLite persistence |
| News | ✅ | Google News + MoneyControl RSS feeds |
| AI insights | ✅ | Optional local Ollama inference (no cloud calls) |
| Live trading | ✅ | Upstox OAuth auth + quote/orders/portfolio/trade via the Upstox broker client |

## API

The server exposes a JSON API alongside the dashboard (all under `http://localhost:8787`):

- `GET /api/personalities` — the 8 personality screeners
- `GET /api/personalities/:slug` — results for one personality
- `GET /api/screen?<criteria>` — run the screener with optional filters
- `GET /api/quote?symbol=` — live quote
- `GET /api/backtest?symbol=&strategy=` — run a backtest
- `GET /api/journal` — trade journal entries
- `GET /api/news` — aggregated news feed
- `GET /api/portfolio` — live portfolio from the broker
- `GET /api/orders` — recent orders from the broker
- `GET /api/ai?symbol=&fundamentals=` — optional local AI analysis
- `GET /api/broker` / `POST /api/broker/auth` — Upstox auth state + OAuth callback
- `POST /api/trade` — place a trade through the broker

## Documentation

- [Getting Started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [Development Guide](docs/development.md)
- [Data Sources](docs/data-sources.md)
- [Screeners](docs/screeners.md)
- [Personality Screeners](docs/personalities.md)
- [Backtesting](docs/backtesting.md)
- [Web Dashboard](docs/dashboard.md)
- [Trade Journal](docs/trade-journal.md)
- [AI Insights](docs/ai-insights.md)
- [Live Trading (Upstox)](docs/upstox-trading.md)

## Project Structure

```
researchTool-ts/
├── src/
│   ├── engines/        # Pure business logic, no I/O (screener, backtest, holding-recommendation)
│   ├── services/       # External integrations (Yahoo, Upstox, Ollama, news, SQLite)
│   ├── data/           # NIFTY 500 universe + NIFTY 50 personality filters
│   ├── types/          # Zod schema + inferred TypeScript types
│   └── server.ts       # Local web dashboard + JSON API (no framework)
├── public/             # Dashboard static assets (index.html, app.js, style.css)
├── tests/              # Vitest test suites
├── docs/               # Documentation
└── data/               # Runtime SQLite database (gitignored)
```

## Design Principles

1. **UI-first** — the web dashboard is the only interface; keep pure, testable logic in `engines/`, not the server
2. **Practical, not redundant** — no unnecessary abstraction layers; thin services for external I/O
3. **Test-driven** — tests written before implementation
4. **Clean data** — Zod validation at every external boundary
5. **Local-first & private** — all AI runs via local Ollama, no cloud calls

## License

MIT
