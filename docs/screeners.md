# Screeners

A Screener run applies either ad-hoc **Criteria** or a curated **Personality** over the Universe. The engine (`src/engines/screener.ts`) is pure: no I/O.

## Universe

The Screener operates over the **dynamic NIFTY 500 Universe** (`src/data/nifty500.ts`). Symbols come from the NSE index CSV. Fundamentals come from Yahoo Finance; `DatabaseService` enforces a 24-hour freshness window internally. There is no hardcoded stock data.

## Available Criteria

| Field | Meaning |
|---|---|
| `minMarketCap` / `maxMarketCap` | Market cap range (₹ crore) |
| `minPe` / `maxPe` | Price-to-earnings range |
| `minPb` / `maxPb` | Price-to-book range |
| `minDividendYield` | Minimum dividend yield (%) |
| `minRoe` | Minimum return on equity (%) |
| `maxDebtToEquity` | Maximum debt-to-equity ratio |
| `minRevenueGrowth` | Minimum revenue growth (%) |

Every field is **optional**. Only the Criteria you specify are applied.

## Behavior rules

- A stock is included only if it passes **all** provided Criteria (AND logic).
- If a stock is **missing the required field**, it fails that criterion. For example, `{ maxPe: 20 }` excludes any stock whose `peRatio` is `undefined`.
- An empty Criteria bag returns the entire Universe.

## Using it via the API

```
GET /api/screen?minMarketCap=500000&maxPe=30&minRoe=15&maxDebtToEquity=0.5
GET /api/screener?minMarketCap=500000&maxPe=30&minRoe=15&maxDebtToEquity=0.5
```

`/api/screener` is an alias of `/api/screen`. Response:

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
import { Screener } from "./src/engines/screener.js";

const screener = new Screener();
const matched = screener.runCriteria(universe, { minPe: 10, maxPe: 25 });
const ranked = screener.runPersonality(universe, "buffett");
```
