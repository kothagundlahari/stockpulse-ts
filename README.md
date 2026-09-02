# StockPulse (TypeScript Edition)

**AI-powered Indian stock research CLI** — a TypeScript rebuild of the Swift `researchTool`, with cleaner architecture, TDD, and practical best practices.

## Why a TypeScript rebuild?

The original project was a native macOS SwiftUI app. This rebuild:

- **Simplifies the architecture** — removes redundant service/view-model layers and the Knowledge folder sync complexity that the Swift app needed for GUI state
- **Is cross-platform** — runs anywhere Node.js does, not just macOS
- **Uses TDD** — every engine and service is covered by tests written first
- **Applies practical standards** — Zod validation, strict TypeScript, no over-engineering

## Quick Start

```bash
# Install
pnpm install

# Build
pnpm build

# Run tests (TDD verification)
pnpm test

# Get a live quote
node dist/cli/index.js quote RELIANCE

# Backtest a strategy
node dist/cli/index.js backtest TCS --strategy sma_crossover

# More commands
node dist/cli/index.js --help
```

## Features

| Feature | Status | Description |
|---|---|---|
| Live Quotes | ✅ | Yahoo Finance chart API, NSE symbols |
| News | ✅ | Google News + MoneyControl RSS feeds |
| Backtesting | ✅ | SMA crossover / buy-and-hold, no look-ahead bias |
| Screeners | ✅ | Filterable by market cap, PE, ROE, etc. |
| Personality Screeners | ✅ | 8 classic investor personalities over the NIFTY 50 |
| Web Dashboard | ✅ | Local dashboard + JSON API (quotes, screeners, backtest, journal, news) |
| Trade Journal | ✅ | SQLite persistence |
| AI Insights | ✅ | Local Ollama inference |
| FYERS Trading | ⚠️ | OAuth auth flow + order placement |

## Documentation

- [Getting Started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [Data Sources](docs/data-sources.md)
- [Backtesting](docs/backtesting.md)
- [Screeners](docs/screeners.md)
- [Personality Screeners](docs/personalities.md)
- [Web Dashboard](docs/dashboard.md)
- [Trade Journal](docs/trade-journal.md)
- [AI Insights](docs/ai-insights.md)
- [Live Trading & FYERS](docs/fyers-trading.md)
- [Development Guide](docs/development.md)

## Project Structure

```
researchTool-ts/
├── src/
│   ├── cli/            # Command-line interface (commander)
│   ├── engines/        # Core business logic (screener, backtest)
│   ├── services/       # External integrations (Yahoo, FYERS, Ollama, DB)
│   ├── data/           # NIFTY 50 universe + personality screeners
│   ├── types/          # Zod schema + inferred TypeScript types
│   └── server.ts       # Local web dashboard + JSON API
├── public/             # Dashboard static assets (HTML/CSS/JS)
├── tests/              # Vitest test suites
├── docs/               # Documentation
└── data/               # Runtime SQLite database (gitignored)
```

## Design Principles

1. **Model-agnostic** — data sources and AI models are swappable via interfaces
2. **Practical, not redundant** — no unnecessary abstraction layers
3. **Test-driven** — tests written before implementation
4. **Clean data** — Zod validation at every boundary
5. **Local-first & private** — all AI runs via local Ollama, no cloud calls

## License

MIT
