# Personality Screeners

Personality screeners express the investing philosophy of a classic investor as a reusable stock filter. Each personality is a pure `(stocks) => stocks` filter applied over the **dynamic NIFTY 500 universe**, using live fundamentals fetched from Yahoo Finance at runtime.

## The 8 personalities

| id | Investor | Philosophy |
|---|---|---|
| `buffett` | Warren Buffett | Quality compounding: high, stable ROE, moderate leverage, strong margins |
| `munger` | Charlie Munger | High-quality moats returning strongly on capital at a reasonable price |
| `lych` | Peter Lynch | GARP: reasonable growth at a reasonable P/E |
| `graham` | Benjamin Graham | Deep value: conservative valuation, low debt, decent earnings & yield |
| `greenblatt` | Joel Greenblatt | Magic Formula: rank by ROIC + earnings yield |
| `klarman` | Seth Klarman | Margin of safety: cheap vs. assets and earnings |
| `dividend` | — | Income: high yield, reasonable valuation, healthy ROE |
| `momentum` | — | Trend: strong recent price performance |

## Running it

From the dashboard's Personalities tab, or via the API:

```
GET /api/personalities               # all personalities with match counts
GET /api/personalities/graham        # just Graham's deep-value screen
```

Each personality shows its matches with symbol, market cap, P/E, and ROE across the full NIFTY 500 universe.

## How a filter is defined

In `src/data/personalities.ts` each personality is a `PersonalityScreener`:

```ts
export interface PersonalityScreener {
  id: string;
  name: string;
  description: string;
  filter: (s: Fundamentals) => boolean;
}

export const PERSONALITIES: PersonalityScreener[] = [
  {
    id: "graham",
    name: "Benjamin Graham",
    description: "Deep value: conservative valuation, low debt, decent earnings and dividend yield.",
    filter: (s) =>
      s.peRatio != null && s.peRatio < 10 &&
      s.pbRatio != null && s.pbRatio < 1.5 &&
      s.debtToEquity != null && s.debtToEquity < 1 &&
      s.dividendYield != null && s.dividendYield > 3,
  },
  // ...
];
```

Filters guard against `undefined` (a stock missing a required field simply fails that test, never crashes).

## Data model

The personality filters operate over the dynamic NIFTY 500 universe (`src/data/nifty500.ts`):

- **Symbol list** is fetched live from the NSE index constituents CSV
- **Per-symbol fundamentals** are fetched from Yahoo Finance with a 30-minute cache
- Symbols that fail to fetch are silently skipped

The `src/data/personalities.ts` file contains only the filter definitions — no hardcoded stock data.

## Adding a personality

1. Add an entry to `PERSONALITIES` in `src/data/personalities.ts`.
2. Add a test asserting the filter picks and excludes known names in `tests/personalities.test.ts` (TDD).
3. No other wiring needed — the dashboard reads `PERSONALITIES` directly.

## Notes

- The eight names overlap: a quality compounder often appears under several personalities. That's expected — each encodes a different weighting.
- If the fundamentals fetch fails for a symbol, that symbol is simply not included in results — it is never fatal.
