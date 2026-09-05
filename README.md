# StockPulse

**A TypeScript web dashboard for Indian stock research** — a UI-first rebuild of the original native Swift `researchTool`, with clean architecture, strict typing, and TDD.

## Why a TypeScript rebuild?

The original project was a native macOS SwiftUI app. This rebuild:

- **Is a web dashboard, not a CLI** — the browser is the only interface; a local server serves the UI and a JSON API
- **Is cross-platform** — runs anywhere Node.js does, not just macOS
- **Uses TDD** — every engine and service is covered by tests written before implementation
- **Applies practical standards** — Zod validation at every external boundary, strict TypeScript with no `any`, no unnecessary abstraction

## Quick Start

```bash
# Install (better-sqlite3 + esbuild need allowBuilds)
pnpm install

# Run the web dashboard (macOS: HTTPS + Safari; needs certs/ from mkcert)
pnpm dev

# Or run it headless, then open https://localhost:8787 in Safari
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
| NIFTY 500 Universe | ✅ | Symbol list fetched live from the NSE index CSV; per-symbol Fundamentals from Yahoo, 24h store TTL |
| Personality runs | ✅ | 8 classic investor Personalities over the NIFTY 500 Universe |
| Screener | ✅ | Criteria: market cap, PE, PB, ROE, debt/equity, revenue growth, dividend yield |
| Live quotes & charts | ✅ | Yahoo Finance chart endpoint, NSE symbols |
| Holding recommendations | ✅ | BUY_MORE / HOLD / SELL on existing Holdings, graded by Confidence |
| News | ✅ | Google News + MoneyControl RSS feeds |
| AI insights | ✅ | Optional local Ollama inference (no cloud calls) |
| Live Orders | ✅ | Broker session (Upstox live adapter) + confirmed Order requests |

## API

The server exposes a JSON API alongside the dashboard (local default `https://localhost:8787` on macOS):

- `GET /api/personalities` — Personality metadata, match counts, Candidates
- `GET /api/personalities/:slug` — one Personality run (`candidates` ranked by score)
- `GET /api/screen?<criteria>` — Criteria Screener run (`/api/screener` is an alias)
- `GET /api/quote?symbol=` — live Quote
- `GET /api/news` — aggregated news feed
- `GET /api/portfolio` — Holdings + advisory Recommendations from the Broker
- `GET /api/orders` — recent Orders from the Broker
- `GET /api/ai` — optional local AI availability
- `GET /callback` — automated Upstox OAuth 2.0 redirect handler
- `GET /api/broker` / `POST /api/broker/auth` — Broker session status + manual OAuth callback
- `POST /api/broker/disconnect` — drop the Broker session
- `POST /api/trade` — place an Order (`confirm: true` required)

## Documentation

- [Getting Started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [Domain glossary](CONTEXT.md)
- [Development Guide](docs/development.md)
- [Data Sources](docs/data-sources.md)
- [Screeners](docs/screeners.md)
- [Personalities](docs/personalities.md)
- [Web Dashboard](docs/dashboard.md)
- [AI Insights](docs/ai-insights.md)
- [Live Trading (Upstox)](docs/upstox-trading.md)

## Project Structure

```
stockpulse-ts/
├── src/
│   ├── engines/        # Pure logic: screener, recommendations, assemblePortfolio
│   ├── services/       # I/O: Yahoo, Broker adapters, portfolio intake, Ollama, news, SQLite
│   ├── data/           # NIFTY 500 Universe + Personality definitions
│   ├── types/          # Zod schema + inferred TypeScript types
│   └── server.ts       # HTTP transport + JSON API (no framework)
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
