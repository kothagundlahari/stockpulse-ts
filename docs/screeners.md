# Screeners

Screeners filter a universe of stocks down to those matching your criteria. The engine (`src/engines/screener.ts`) is a pure function.

## Available criteria

| Field | Meaning |
|---|---|
| `minMarketCap` / `maxMarketCap` | Market cap range (₹ crore) |
| `minPe` / `maxPe` | Price-to-earnings range |
| `minPb` / `maxPb` | Price-to-book range |
| `minDividendYield` | Minimum dividend yield (%) |
| `minRoe` | Minimum return on equity (%) |
| `maxDebtToEquity` | Maximum debt-to-equity ratio |
| `sectors` | Allowed sectors (reserved for future use) |

Every criterion is **optional**. Only the criteria you specify are applied; unspecified ones don't constrain results.

## Behavior rules

- A stock is included only if it passes **all** provided criteria (AND logic).
- If a stock is **missing the required field**, it's treated as failing that criterion. For example, `{ maxPe: 20 }` excludes any stock whose `peRatio` is `undefined`.
- An empty criteria object returns the entire universe.

## Example

Filter for large-cap, reasonably valued, high-ROE, low-debt stocks:

```ts
const results = engine.filter(stocks, {
  minMarketCap: 500000, // ₹5 lakh crore
  maxPe: 30,
  minRoe: 15,
  maxDebtToEquity: 0.5,
});
```

## Values vs. percentages

The engine compares raw numeric values. It does **not** divide by 100 for you:
- `minDividendYield: 2` means a **2%** yield
- `minRoe: 15` means **15%** ROE
- `maxDebtToEquity: 0.5` means a 0.5 ratio

## Feeding it data

The screener needs an array of `Fundamentals`. In the current CLI, live fundamental fetching from Screener.in is a placeholder (see the `screen` command help). The engine is fully exercised by unit tests against realistic mock data (`tests/screener.test.ts`), so wiring a new data source is the only remaining step to run it live.

## Using it in your own code

```ts
import { ScreenerEngine } from "./src/engines/screener.js";

const engine = new ScreenerEngine();
const filtered = engine.filter(myStocks, { minPe: 10, maxPe: 25 });
```

Because the engine is stateless, you can reuse a single instance across many universes.
