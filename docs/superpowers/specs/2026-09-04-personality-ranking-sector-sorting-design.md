# Personality Ranking, Hybrid Sector Adjustment, and Interactive Sorting Design

**Date:** 2026-09-04  
**Status:** Approved  
**Topic:** Personality screener ranking, hybrid sector-adjusted scoring, and interactive table sorting/filtering

---

## 1. Overview & Problem Statement

StockPulse provides 8 classic investor personality screeners (e.g., Warren Buffett, Benjamin Graham, Charlie Munger, Peter Lynch) to filter the NIFTY 500 universe.

Previously, candidates were returned in raw universe insertion order (neither ascending nor descending). In addition, comparing firms across different sectors is inherently difficult because different sectors have structurally divergent margin profiles and capital requirements (e.g. software companies operating at 25% margins vs. retail or energy companies operating at 5–8% margins).

To make identifying the single best stock straightforward, this design introduces:
1. **Hybrid Sector-Adjusted Scoring Engine (`0–100`)**: Evaluates valuation directly against personality thresholds while normalizing operating margin and ROE against the stock's sector benchmark.
2. **Default Descending Sort**: Automatically sorts candidates with the highest-scoring stock at the top of the table.
3. **Sector Filter Dropdown**: Allows filtering candidates by sector with live counts (e.g., `All Sectors (24)`, `Technology (6)`).
4. **Table Enhancements**: Adds **Score** and **Operating Margin** columns alongside existing metrics.
5. **Interactive Column Sorting**: Enables users to sort by any column (`Symbol`, `Market Cap`, `PE`, `ROE`, `Op Margin`, `Sector`, `Score`) in ascending or descending order.

---

## 2. Hybrid Sector-Adjusted Scoring Model

### 2.1 Sector Benchmarking
Before scoring candidates, the engine aggregates the NIFTY 500 universe by sector to compute sector medians:
- `medianOperatingMargin` per sector (fallback to 12.0% if missing or sector size < 3)
- `medianRoe` per sector (fallback to 15.0% if missing or sector size < 3)

For each stock:
- `marginRatio = clamp((stock.operatingMargin ?? sectorMedianMargin) / sectorMedianMargin, 0.5, 2.0)`
- `roeRatio = clamp((stock.roe ?? sectorMedianRoe) / sectorMedianRoe, 0.5, 2.0)`

### 2.2 Personality-Specific Scoring Formulas (0–100 Scale)

1. **Warren Buffett (`buffett`)** — Quality compounder with high sector-relative margin & ROE and minimal debt:
   - Sector Margin Performance: `(marginRatio / 2.0) * 35`
   - Sector ROE Performance: `(roeRatio / 2.0) * 35`
   - Balance Sheet Safety: `(1 - clamp(stock.debtToEquity ?? 0.5, 0, 0.5) / 0.5) * 30`

2. **Charlie Munger (`munger`)** — High-quality moat at reasonable price:
   - Sector ROE Performance: `(roeRatio / 2.0) * 40`
   - Valuation Factor: `(1 - clamp(stock.peRatio ?? 35, 0, 35) / 35) * 35`
   - Balance Sheet Safety: `(1 - clamp(stock.debtToEquity ?? 0.5, 0, 0.5) / 0.5) * 25`

3. **Peter Lynch (`lych`)** — Growth at a reasonable price (GARP):
   - PEG Ratio Factor: `peg = (stock.peRatio ?? 25) / max(stock.revenueGrowth ?? 15, 1)`; PEG <= 1.0 yields 40 pts, scaling down linearly to 0 pts at PEG >= 3.0: `clamp(1 - (peg - 1) / 2, 0, 1) * 40`
   - Sector Profitability: `(roeRatio / 2.0) * 30`
   - Revenue Growth: `clamp((stock.revenueGrowth ?? 10) / 30, 0.33, 1.0) * 30`

4. **Benjamin Graham (`graham`)** — Deep value and margin of safety:
   - PE Discount: `(1 - clamp(stock.peRatio ?? 15, 0, 15) / 15) * 35`
   - PB Discount: `(1 - clamp(stock.pbRatio ?? 1.5, 0, 1.5) / 1.5) * 35`
   - Dividend Yield: `clamp((stock.dividendYield ?? 1) / 5, 0.2, 1.0) * 15`
   - Sector Margin Stability: `(marginRatio / 2.0) * 15`

5. **Joel Greenblatt (`greenblatt`)** — Magic formula (high earnings yield + high return on capital):
   - Earnings Yield (`1 / PE`): `clamp((1 / (stock.peRatio ?? 20)) / (1 / 8), 0.2, 1.0) * 40`
   - Sector ROE Performance: `(roeRatio / 2.0) * 40`
   - Low Debt Factor: `(1 - clamp(stock.debtToEquity ?? 0.5, 0, 0.5) / 0.5) * 20`

6. **Seth Klarman (`klarman`)** — Margin of safety:
   - PB Discount: `(1 - clamp(stock.pbRatio ?? 2.0, 0, 2.0) / 2.0) * 45`
   - Low Debt Factor: `(1 - clamp(stock.debtToEquity ?? 0.5, 0, 0.5) / 0.5) * 30`
   - Sector ROE Performance: `(roeRatio / 2.0) * 25`

7. **Dividend Growth (`dividend`)** — High sustainable dividend yield + quality:
   - Dividend Yield: `clamp((stock.dividendYield ?? 2.5) / 7.0, 0.35, 1.0) * 45`
   - Sector ROE Performance: `(roeRatio / 2.0) * 30`
   - PE Valuation: `(1 - clamp(stock.peRatio ?? 25, 0, 25) / 25) * 25`

8. **Growth Momentum (`momentum`)** — Revenue growth + expanding scale:
   - Revenue Growth: `clamp((stock.revenueGrowth ?? 15) / 40, 0.35, 1.0) * 35`
   - Sector Margin Performance: `(marginRatio / 2.0) * 35`
   - Sector ROE Performance: `(roeRatio / 2.0) * 30`

Final score is rounded to an integer between `0` and `100`.

---

## 3. Architecture & Engine Design

- File: `src/engines/personality-ranker.ts`
- Pure business logic, ESM, no I/O, strict TypeScript.
- Primary exports:
  - `export interface SectorBenchmark { medianOperatingMargin: number; medianRoe: number; }`
  - `export type RankedStock = Fundamentals & { score: number; };`
  - `export function computeSectorMedians(universe: Fundamentals[]): Map<string, SectorBenchmark>`
  - `export function calculatePersonalityScore(personalityId: string, stock: Fundamentals, benchmark: SectorBenchmark): number`
  - `export function rankPersonalityCandidates(personalityId: string, filter: (s: Fundamentals) => boolean, universe: Fundamentals[]): RankedStock[]`

Candidates are sorted descending by `score`:
```ts
matched.sort((a, b) => b.score - a.score);
```

---

## 4. API Endpoints

- `GET /api/personalities`:
  Each item in `personalities[i].stocks` now includes `score: number` and is sorted descending by `score`.
- `GET /api/personalities/:id`:
  The `stocks` array includes `score: number` and is sorted descending by `score`.

---

## 5. Frontend UI/UX Design

### 5.1 Sector Filter Dropdown
Above the table in the personality detail header:
- `<select id="personality-sector-filter" class="form-select personality-sector-filter">`
- Populated with distinct sectors in the candidate list:
  - `<option value="ALL">All Sectors (${stocks.length})</option>`
  - `<option value="${sector}">${sector} (${count})</option>`

### 5.2 Table Headers & Interactive Sorting
Headers:
- `Symbol`, `Market Cap`, `PE`, `ROE`, `Op Margin`, `Sector`, `Score`, `Action`
- Headers (except Action) are clickable with `.sortable` class.
- Active sort column shows sort indicator icon (`▲` ascending / `▼` descending).
- Default sort: `column = "score"`, `direction = "desc"`.

### 5.3 Row Display
- **Op Margin**: Displayed as `${stock.operatingMargin.toFixed(1)}%` (or `—` if missing).
- **Score**: Rendered as a pill:
  `<span class="score-badge ${score >= 80 ? 'score-high' : score >= 60 ? 'score-mid' : 'score-low'}">${stock.score}</span>`
- Retains existing clickable symbol and direct "Buy" execution button.

---

## 6. Testing & Quality Standards

- Unit tests for `PersonalityRanker` in `tests/personality-ranker.test.ts`.
- Server API tests in `tests/server.test.ts` verifying `/api/personalities` returns sorted candidates with `score`.
- Biome check (`pnpm check`) and full test suite (`pnpm test`).
