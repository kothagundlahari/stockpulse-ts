# Personalities

A Personality encodes a classic investor's philosophy as a `Fundamentals → boolean` match plus a sector-adjusted score. Personalities run over the **dynamic NIFTY 500 Universe**, using live Fundamentals from Yahoo Finance.

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
| `momentum` | — | Trend: strong growth with rising profitability |

## Running it

From the dashboard's Personalities tab, or via the API:

```
GET /api/personalities               # all personalities with match counts and ranked stocks
GET /api/personalities/graham        # one Personality run
```

The HTTP handlers delegate to `Screener.runAllPersonalities` / `runPersonalityDetail`.

## How a Personality is defined

In `src/data/personalities.ts` each Personality is a `PersonalityDefinition`: identity, description, match predicate, and scoring formula live together.

```ts
export interface PersonalityDefinition {
  id: string;
  name: string;
  description: string;
  matches: (s: Fundamentals) => boolean;
  score: (stock: Fundamentals, benchmark: SectorBenchmark) => number;
}
```

`matches` treats missing fields as failing the test (never throws). Scores are 0–100 and sector-benchmarked via `src/engines/personality-ranker.ts`.

## Data model

Personality runs operate over the dynamic Universe (`src/data/nifty500.ts`):

- **Symbol list** is fetched live from the NSE index CSV
- **Per-symbol Fundamentals** are fetched from Yahoo Finance; the store expires rows internally (default 24h)
- Symbols that fail to fetch are skipped

## Adding a Personality

1. Add an entry to `PERSONALITIES` in `src/data/personalities.ts` (id, name, description, `matches`, `score`).
2. Add a test in `tests/personalities.test.ts` (TDD).
3. No other wiring — `Screener.getPersonalities()` reads `PERSONALITIES`.
