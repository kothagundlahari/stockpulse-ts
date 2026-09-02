# Personality Screeners

Personality screeners express the investing philosophy of a classic investor as a reusable stock filter. Each personality is a pure `(stocks) => stocks` filter applied over the **NIFTY 50** universe, using live fundamentals fetched from Yahoo Finance at runtime (with the bundled `src/data/nifty50.ts` snapshot as fallback).

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

From the CLI:

```sh
node dist/cli/index.js personalities               # all personalities
node dist/cli/index.js personalities -p graham     # just Graham's deep-value screen
node dist/cli/index.js personalities -p buffett    # just Buffett's quality screen
```

(Build first with `pnpm build`, or use `pnpm exec tsx src/cli/index.ts personalities` to skip the build.)

Each personality prints its matches with symbol, market cap, P/E and ROE.

## How a filter is defined

In `src/data/nifty50.ts` each personality is a `PersonalityScreener`:

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

The universe starts from `src/data/nifty50.ts`: a `NIFTY50` array of ~49 unique `Fundamentals` records with `symbol`, `sector`, `marketCap`, `peRatio`, `pbRatio`, `dividendYield`, `roe`, `debtToEquity`, and `revenueGrowth`. These serve as the symbol list and a fallback snapshot.

When you run the CLI or the dashboard's Personalities tab, the screeners fetch **live fundamentals** for every NIFTY 50 constituent from Yahoo Finance (`getLiveNifty50Fundamentals` in `src/data/live-nifty50.ts`), fetched concurrently (4 at a time) and cached in-memory for 15 minutes. Live values are merged over the bundled snapshot (`mergeFundamentals`) so every field stays populated even if a symbol can't be fetched — in which case the static value is used as a fallback.

## Adding a personality

1. Add an entry to `PERSONALITIES` in `src/data/nifty50.ts`.
2. Add a test asserting the filter picks and excludes known names in `tests/personalities.test.ts` (TDD).
3. No other wiring needed — the CLI and dashboard read `PERSONALITIES` directly.

## Notes

- The eight names overlap: a quality compounder often appears under several personalities. That's expected — each encodes a different weighting, and the CLI shows the match count out of the full universe.
- If you change the bundled fundamentals, re-run `tests/personalities.test.ts` to confirm the assertion stocks still pass/fail as intended.
