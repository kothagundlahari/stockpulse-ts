# Data Sources

StockPulse pulls data from multiple free sources to build a complete picture of Indian (NIFTY) equities. Only the live Broker adapter (Upstox) requires credentials.

| Source | Data provided | Auth required | Cost |
|---|---|---|---|
| Yahoo Finance v8 API | Live quotes, historical prices, fundamentals, search | No | Free |
| NSE Index CSV | NIFTY 500 constituent symbol list | No | Free |
| Upstox Developer API | Holdings, Positions, Orders, Order placement | Yes (OAuth) | Free* |
| Ollama (local) | AI insights | No | Free |

\* Upstox has no per-call cost for personal use. The API key and secret are required.

## Yahoo Finance (`/services/yahoo-finance.ts`)

Used for core market data: live quotes, historical OHLCV, per-symbol fundamentals, and symbol search. Symbols are suffixed with `.NS` to target the National Stock Exchange.

**Important:** Yahoo now rejects requests without a browser-style `User-Agent` header (returning `404`/`429`), and the raw `quote` endpoint is unreliable. This service therefore:

- Sends a browser `User-Agent` and `Accept: application/json` on every request
- Sources **live Quotes from chart metadata** (`/v8/finance/chart`, range `1d`), which is more permissive and returns the same fields (last price, prev close, day high/low, volume, timestamp) plus the per-bar open

**Endpoints used:**
- `GET /v8/finance/chart/{symbol}.NS?range=...&interval=1d` — quote + historical OHLCV
- `GET /v1/finance/search` — symbol search

**Handled:** `.NS` suffixing, Indian exchange filtering, day-open extracted from the latest price bar, error propagation with a clear message.

## NSE Index CSV (`/data/nifty500.ts`)

The NIFTY 500 Universe is sourced live from the official NSE index constituents CSV (`ind_nifty500list.csv`). This is the primary symbol list used by the Screener, Personality runs, and the dynamic Universe.

- Symbols are parsed from the CSV at fetch time
- The symbol list is cached for 24 hours
- Per-symbol Fundamentals are fetched from Yahoo Finance; `getFreshFundamentals` / `getAllFreshFundamentals` expire rows internally (default 24 hours)
- Symbols that fail to fetch fall back to cached Fundamentals when available

Multiple sources are used because no single source provides everything: NSE provides the authoritative constituent list, while Yahoo Finance provides the fundamental data (P/E, ROE, debt-to-equity, etc.) needed for screening.

## Upstox (`/services/upstox.ts`)

See [Upstox Trading](upstox-trading.md). Provides holdings, positions, orders, and trade execution via the Upstox Developer API. Requires OAuth2 credentials.

## Ollama (`/services/ollama.ts`)

See [AI Insights](ai-insights.md). Runs entirely locally. Optional — the dashboard works without it.

## Limitations & rate limits

- **Yahoo Finance** can rate-limit heavy usage, and now requires a browser `User-Agent` header (the service sets it automatically). If you hit `429` or empty data, wait a few seconds and retry.
- The live quote's **open** price is taken from the latest intraday price bar; on non-trading days it may equal the last price.
- **NSE CSV** may occasionally be unavailable. A failed fetch throws an error; the cached symbol list is used if available.
- This tool is for **research only**; always cross-check data with your broker before acting on it.
