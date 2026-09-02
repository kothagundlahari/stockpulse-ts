# Data Sources

All primary data sources are free and require no API keys. Only FYERS (for live trading) needs credentials.

| Source | Data provided | Auth required | Cost |
|---|---|---|---|
| Yahoo Finance v8 API | Live quotes, historical prices, search | No | Free |
| Google News RSS | Stock-specific news | No | Free |
| MoneyControl RSS | Market commentary | No | Free |
| FYERS API v3 | Live quotes, order placement | Yes (OAuth) | Free* |
| Ollama (local) | AI insights | No | Free |

\* FYERS requires an approved developer account, but the API itself has no per-call cost for personal use.

## Yahoo Finance (`/services/yahoo-finance.ts`)

Used for the core market data. Symbols are suffixed with `.NS` to target the National Stock Exchange.

**Endpoints:**
- `GET /v8/finance/quote` — real-time quote
- `GET /v8/finance/chart` — historical OHLCV
- `GET /v1/finance/search` — symbol search

**Handled:** `.NS` suffixing, Indian exchange filtering in search, error propagation with a clear message.

## News RSS (`/services/news.ts`)

Combines Google News RSS (queried per-symbol) and MoneyControl headlines. The parser extracts `title`, `link`, and `pubDate` from `<item>` blocks via a lightweight regex parser — chosen over a heavy XML DOM dependency.

Failed feeds are skipped silently so one slow feed never blocks the rest.

## FYERS (`/services/fyers.ts`)

See [Live Trading & FYERS](fyers-trading.md). Requires OAuth2 credentials.

## Ollama (`/services/ollama.ts`)

See [AI Insights](ai-insights.md). Runs entirely locally.

## Limitations & rate limits

- **Yahoo Finance** can rate-limit heavy usage. The CLI makes one request per command, which is typically fine. If you hit `429` or empty data, wait a few seconds and retry.
- **RSS feeds** may occasionally return empty results. The parser returns an empty array rather than throwing.
- This tool is for **research only**; always cross-check data with your broker before acting on it.
