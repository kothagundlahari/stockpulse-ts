# Getting Started

This guide walks you through installing and running StockPulse for the first time.

## Prerequisites

- **Node.js 18+** (tested on 22)
- **npm** (bundled with Node.js)
- Optional: **Ollama** for AI insights, **FYERS API credentials** for live trading

## Installation

```bash
git clone <your-repo-url> && cd researchTool-ts
npm install
npm run build
```

## Verify the setup

```bash
npm test
```

This runs the TDD test suite. All tests should pass.

## Quick usage

### Get a live quote

```bash
node dist/cli/index.js quote RELIANCE
```

Output:

```
RELIANCE @ ₹2500.00
  Change: +2.04%
  Open: ₹2480.00  High: ₹2520.00  Low: ₹2460.00
  Volume: 1,000,000
```

### Backtest a stock

```bash
node dist/cli/index.js backtest TCS --strategy sma_crossover
```

### Fetch recent news

```bash
node dist/cli/index.js news HDFCBANK
```

### Trade journal

```bash
# Add an entry (interactive)
node dist/cli/index.js journal --add

# List all entries
node dist/cli/index.js journal --list
```

## Option A: Enable AI insights (Ollama)

AI insights run entirely on your local machine using [Ollama](https://ollama.com).

```bash
# Install Ollama
brew install ollama

# Start the server
ollama serve

# Pull a model (this is one option; 'llama3' or 'qwen3:8b' also work)
ollama pull llama3
```

Then generate a stock insight:

```bash
node dist/cli/index.js insight RELIANCE
```

## Option B: Enable live trading (FYERS)

Live trading requires a FYERS developer account. See [Live Trading & FYERS](fyers-trading.md) for the full setup.

## Where data lives

- **SQLite database**: `./data/stockpulse.db` (auto-created)
- **Cached prices**: Yahoo Finance API (no local storage)
- The `data/` folder is gitignored — it holds your local journal and screeners.

## Troubleshooting

**"Cannot find module 'commander'"**
Run `npm install` again, then `npm run build`.

**Backtest returns no data**
The Yahoo Finance endpoint may be rate-limiting. Wait a moment and retry. Check your internet connection.

**Ollama insight says the server isn't running**
Start Ollama with `ollama serve` and pull a model first.
