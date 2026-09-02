# Local Web Dashboard

StockPulse ships a lightweight local web dashboard for browsing the same data the CLI exposes, without typing commands. It's a zero-dependency Node HTTP server (`src/server.ts`) that serves static assets from `public/` and a small JSON API that reuses the existing services and engines.

## Starting it

```sh
pnpm dev:server      # dev: tsx src/server.ts  -> http://localhost:8787
pnpm start:server    # prod: node dist/server.js (run `pnpm build` first)
```

`PORT` is configurable via the `PORT` environment variable (default `8787`).

## Dashboard tabs

| Tab | What it shows |
|---|---|
| **Quotes** | Live price, change %, open/high/low, volume for any symbol |
| **Personalities** | Every personality with its match count and the matching NIFTY 50 stocks (P/E, ROE, sector) |
| **Backtest** | SMA-crossover backtest over a chosen range with return, max drawdown, win rate, and per-trade P&L |
| **Journal** | Trade journal entries from the local SQLite database |
| **News** | Latest headlines for a symbol |

## JSON API

The server exposes the same operations in machine-readable form:

```
GET /api/quote?symbol=TCS
GET /api/personalities
GET /api/personalities/:id
GET /api/backtest?symbol=TCS&range=1y
GET /api/journal
GET /api/news?symbol=TCS&limit=10
```

All endpoints return JSON; errors return a non-200 status with an `{ "error": "..." }` body.

## How it's put together

- `src/server.ts` — the HTTP server: routing, JSON handling, static file serving, and the SMA-crossover strategy used for the backtest tab.
- `public/index.html`, `public/style.css`, `public/app.js` — the browser front end (plain HTML/CSS/JS, no build step).
- The API handlers call into the same `YahooFinanceService`, `DatabaseService`, `BacktestEngine`, and `PERSONALITIES` the CLI uses, so there's a single source of truth for behavior.

## Security notes

- **Local only** — the server binds to all interfaces by default and has no auth. Don't expose port `8787` to the internet.
- The API is read-only. Journal entries are created via the CLI, not through the dashboard.
