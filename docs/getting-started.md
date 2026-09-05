# Getting Started

This guide walks you through installing and running StockPulse for the first time.

## Prerequisites

- **Node.js 20+** (see `package.json` `engines`)
- **pnpm** (package manager — install via `npm install -g pnpm` or Corepack)
- Optional: **Ollama** for AI insights, **Upstox developer account** for live Orders

## Installation

```bash
git clone https://github.com/kothagundlahari/stockpulse-ts.git && cd stockpulse-ts
pnpm install
pnpm build
```

## Verify the setup

```bash
pnpm test
```

This runs the TDD test suite. All tests should pass.

## Starting the dashboard

StockPulse is a UI-first web dashboard. The web server is the only entry point.

```bash
pnpm dev          # starts the server and opens http://localhost:8787
pnpm dev:server   # starts the server without opening a browser
```

`PORT` is configurable via the `PORT` environment variable (default `8787`).

Once running, the dashboard opens in your browser with tabs for Quotes, Personalities, News, and Portfolio.

### Production mode

```bash
pnpm build        # compile first
pnpm start:server # runs node dist/server.js
```

## Option A: Enable AI insights (Ollama)

AI insights run entirely on your local machine using [Ollama](https://ollama.com). This is completely optional — the dashboard works without it.

```bash
# Install Ollama
brew install ollama

# Start the server
ollama serve

# Pull a model (llama3 or qwen3:8b also work)
ollama pull llama3
```

If Ollama is running, the Portfolio tab shows an AI deep-dive panel for any holding. If Ollama is not running, the panel is hidden — nothing else is affected.

## Option B: Enable live Orders (Upstox)

Live Orders require an Upstox developer account. See [Upstox Trading](upstox-trading.md) for the full setup.

## Where data lives

- **SQLite database**: `./data/stockpulse.db` (auto-created; Broker session + Fundamentals cache)
- **Quotes and history**: Yahoo Finance API (not stored locally)
- The `data/` folder is gitignored — it holds your local cache and Broker session.

## Troubleshooting

**Quotes or news return no data**
The Yahoo Finance or news endpoint may be rate-limiting. Wait a moment and retry. Check your internet connection.

**Ollama insight panel not showing**
Start Ollama with `ollama serve` and pull a model first. The panel is only visible when Ollama is running locally.

**Upstox holdings not loading**
Ensure `UPSTOX_API_KEY`, `UPSTOX_API_SECRET`, and `UPSTOX_REDIRECT_URI` are set in your environment. Re-authenticate via the Portfolio tab if your token has expired.
