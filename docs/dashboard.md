# Local Web Dashboard

StockPulse is a UI-first web dashboard. It is a zero-dependency Node HTTP server (`src/server.ts`) that serves static assets from `public/` and a JSON API that reuses the existing services and engines. The web dashboard is the only interface — there is no CLI.

## Starting it

```sh
pnpm dev             # dev with auto-open browser -> http://localhost:8787
pnpm dev:server      # dev without auto-open  -> http://localhost:8787
pnpm start:server    # prod: node dist/server.js (run `pnpm build` first)
```

`pnpm dev` opens the dashboard in your default browser automatically. To launch the server without opening a browser, use `pnpm dev:server` or `pnpm start:server`.

`PORT` is configurable via the `PORT` environment variable (default `8787`).

## Dashboard tabs

| Tab | What it shows |
|---|---|
| **Quotes** | Live price, change %, open/high/low, volume for any symbol |
| **Personalities** | Every personality with its match count and the matching NIFTY 500 stocks (P/E, ROE, sector) |
| **Backtest** | SMA-crossover backtest over a chosen range with return, max drawdown, win rate, and per-trade P&L |
| **News** | Latest headlines for a symbol |
| **Portfolio** | Holdings with live P&L, per-holding Recommendations, order panel, and order history |

## Portfolio tab

The Portfolio tab is the primary interface for broker integration:

- **Holdings list** — symbol, quantity, average price, LTP, day change, day-change %, P&L (₹ and %), current value
- **Recommendation badge** per holding (BUY MORE / HOLD / SELL) with expandable rule-based reasons
- **Order panel** — symbol, quantity, side (BUY/SELL), order type (LIMIT/MARKET), limit price
- **Confirmation modal** — red warning ("This places a REAL order with your broker") with an explicit confirm button
- **Order history** — recent broker orders with status
- **Broker status bar** — shows whether Upstox is authenticated, with a connect/re-auth action
- **AI deep-dive** (optional) — if Ollama is running, shows a free-text analysis for a selected holding; if not, the panel is hidden

## JSON API

### Existing endpoints

```
GET /api/quote?symbol=TCS
GET /api/personalities
GET /api/personalities/:id
GET /api/screen?minMarketCap=500000&maxPe=30&minRoe=15
GET /api/screener?minMarketCap=500000&maxPe=30&minRoe=15
GET /api/backtest?symbol=TCS&range=1y
GET /api/news?symbol=TCS&limit=10
GET /api/ai
```

### Broker and portfolio endpoints

```
GET /api/broker                    # Upstox auth status + auth URL
POST /api/broker/auth              # Complete OAuth — body: { code }
GET /api/portfolio                 # Holdings + live quotes + recommendations
GET /api/orders                    # Recent broker orders
POST /api/trade                    # Place a real order — body: { symbol, side, qty, type, limitPrice?, confirm: true }
```

All endpoints return JSON; errors return a non-200 status with an `{ "error": "..." }` body.

### Trade safety

The `POST /api/trade` endpoint requires `confirm: true` in the request body. If `confirm` is not explicitly `true`, the server rejects the Order request. This is a server-side backstop — the dashboard shows a confirmation modal before sending the request.

## How it's put together

- `src/server.ts` — HTTP transport: routing, JSON handling, static files.
- `public/index.html`, `public/style.css`, `public/app.js` — the browser front end (plain HTML/CSS/JS, no build step).
- Handlers delegate to `loadPortfolio`, `Screener`, `BacktestEngine`, `YahooFinanceService`, and `DatabaseService`.

## Security notes

- **Local only** — the server binds to `127.0.0.1` by default (`HOST` overrides). Don't expose port `8787` to the internet.
- **Trade confirmation** — every order requires `confirm: true` and the dashboard enforces a confirmation modal.
- **Broker tokens** are stored only in the local gitignored SQLite database.
