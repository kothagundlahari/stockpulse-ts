# Screeners

Screeners filter a universe of stocks down to those matching your criteria. The engine (`src/engines/screener.ts`) is a pure function with no I/O.

## Universe

The screener operates over the **dynamic NIFTY 500 universe** (`src/data/nifty500.ts`). Symbol lists are fetched live from the NSE index constituents CSV, and per-symbol fundamentals are fetched from Yahoo Finance with a 30-minute cache. There is no hardcoded stock data.

## Available criteria

| Field | Meaning |
|---|---|
| `minMarketCap` / `maxMarketCap` | Market cap range (₹ crore) |
| `minPe` / `maxPe` | Price-to-earnings range |
| `minPb` / `maxPb` | Price-to-book range |
| `minDividendYield` | Minimum dividend yield (%) |
| `minRoe` | Minimum return on equity (%) |
| `maxDebtToEquity` | Maximum debt-to-equity ratio |
| `minRevenueGrowth` | Minimum revenue growth (%) |

Every criterion is **optional**. Only the criteria you specify are applied; unspecified ones don't constrain results.

## Behavior rules

- A stock is included only if it passes **all** provided criteria (AND logic).
- If a stock is **missing the required field**, it's treated as failing that criterion. For example, `{ maxPe: 20 }` excludes any stock whose `peRatio` is `undefined`.
- An empty criteria object returns the entire universe.

## Using it via the API

The screener is exposed through `GET /api/screen` on the web dashboard. Pass criteria as query parameters:

```
GET /api/screen?minMarketCap=500000&maxPe=30&minRoe=15&maxDebtToEquity=0.5
```

Response:

```json
{
  "total": 500,
  "matches": 12,
  "stocks": [...]
}
```

Available query parameters: `minMarketCap`, `maxMarketCap`, `minPe`, `maxPe`, `minPb`, `maxPb`, `minDividendYield`, `minRoe`, `maxDebtToEquity`, `minRevenueGrowth`.

## Values vs. percentages

The engine compares raw numeric values. It does **not** divide by 100 for you:
- `minDividendYield: 2` means a **2%** yield
- `minRoe: 15` means **15%** ROE
- `maxDebtToEquity: 0.5` means a 0.5 ratio

## Using it in your own code

```ts
import { ScreenerEngine } from "./src/engines/screener.js";

const engine = new ScreenerEngine();
const filtered = engine.filter(myStocks, { minPe: 10, maxPe: 25 });
```

Because the engine is stateless, you can reuse a single instance across many universes.
