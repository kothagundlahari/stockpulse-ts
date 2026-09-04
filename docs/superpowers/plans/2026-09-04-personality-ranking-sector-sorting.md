# Personality Ranking, Sector Normalization, and Interactive Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable investors to easily identify the highest-value stock in each personality screener by calculating a hybrid sector-adjusted score (0–100), sorting candidates descending by score by default, providing a sector filter dropdown, and supporting interactive multi-column sorting.

**Architecture:** Pure quantitative scoring and sector benchmarking logic is implemented in `src/engines/personality-ranker.ts`, computing sector median operating margins and ROEs to benchmark profitability while using direct valuation multiples. `src/server.ts` applies this engine across `/api/personalities` and `/api/personalities/:id`. The frontend in `public/app.js` and `public/style.css` adds interactive column sorting (Score, Op Margin, ROE, PE, Market Cap, Symbol) and a Sector filter dropdown.

**Tech Stack:** TypeScript (ESM, Node16 resolution), Node.js `http` server, Vanilla HTML5/CSS3/JavaScript, Vitest, Biome.

**Spec:** [docs/superpowers/specs/2026-09-04-personality-ranking-sector-sorting-design.md](file:///Users/kothagundlaharikrishna/Documents/GitHub/researchTool-ts/docs/superpowers/specs/2026-09-04-personality-ranking-sector-sorting-design.md)

## Global Constraints

- Strict TS, no `any` (use `unknown` + narrowing).
- `type: module`, ESM with Node16 resolution — all relative imports must use `.js` extensions even when importing `.ts` files.
- Biome standards: double quotes, semicolons always, 2-space indent, 100-col width.
- `src/engines/` must remain pure business logic with no I/O or server dependencies.
- Frontend files `public/app.js` and `public/style.css` use standard vanilla JS and CSS without external build bundlers.

---

### Task 1: Hybrid Sector-Adjusted Personality Ranking Engine

**Files:**
- Create: `src/engines/personality-ranker.ts`
- Test: `tests/personality-ranker.test.ts`

**Interfaces:**
- Consumes: `Fundamentals` from `src/types/index.js`
- Produces:
  ```ts
  export interface SectorBenchmark {
    medianOperatingMargin: number;
    medianRoe: number;
  }
  export type RankedStock = Fundamentals & { score: number };
  export function computeSectorMedians(universe: Fundamentals[]): Map<string, SectorBenchmark>;
  export function calculatePersonalityScore(
    personalityId: string,
    stock: Fundamentals,
    benchmark: SectorBenchmark,
  ): number;
  export function rankPersonalityCandidates(
    personalityId: string,
    filter: (s: Fundamentals) => boolean,
    universe: Fundamentals[],
  ): RankedStock[];
  ```

- [ ] **Step 1: Write the failing unit tests for `PersonalityRanker`**

Create `tests/personality-ranker.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  computeSectorMedians,
  calculatePersonalityScore,
  rankPersonalityCandidates,
} from "../src/engines/personality-ranker.js";
import type { Fundamentals } from "../src/types/index.js";

const FIXTURE_UNIVERSE: Fundamentals[] = [
  {
    symbol: "TECH1",
    sector: "Technology",
    peRatio: 20,
    pbRatio: 4,
    dividendYield: 1.5,
    roe: 30,
    debtToEquity: 0.1,
    operatingMargin: 25,
    revenueGrowth: 15,
  },
  {
    symbol: "TECH2",
    sector: "Technology",
    peRatio: 28,
    pbRatio: 6,
    dividendYield: 0.8,
    roe: 20,
    debtToEquity: 0.2,
    operatingMargin: 21,
    revenueGrowth: 12,
  },
  {
    symbol: "RETAIL1",
    sector: "Consumer",
    peRatio: 12,
    pbRatio: 1.4,
    dividendYield: 2.0,
    roe: 18,
    debtToEquity: 0.3,
    operatingMargin: 8,
    revenueGrowth: 14,
  },
  {
    symbol: "RETAIL2",
    sector: "Consumer",
    peRatio: 14,
    pbRatio: 1.2,
    dividendYield: 2.5,
    roe: 14,
    debtToEquity: 0.4,
    operatingMargin: 6,
    revenueGrowth: 8,
  },
];

describe("PersonalityRanker", () => {
  it("computes sector medians accurately", () => {
    const medians = computeSectorMedians(FIXTURE_UNIVERSE);
    const tech = medians.get("Technology");
    const retail = medians.get("Consumer");

    expect(tech).toBeDefined();
    expect(tech?.medianOperatingMargin).toBe(23); // (25 + 21) / 2
    expect(tech?.medianRoe).toBe(25); // (30 + 20) / 2

    expect(retail).toBeDefined();
    expect(retail?.medianOperatingMargin).toBe(7); // (8 + 6) / 2
    expect(retail?.medianRoe).toBe(16); // (18 + 14) / 2
  });

  it("calculates sector-adjusted score between 0 and 100", () => {
    const benchmark = { medianOperatingMargin: 7, medianRoe: 16 };
    const stock = FIXTURE_UNIVERSE[2]; // RETAIL1
    const score = calculatePersonalityScore("buffett", stock, benchmark);

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("ranks candidates descending by score", () => {
    const ranked = rankPersonalityCandidates("graham", () => true, FIXTURE_UNIVERSE);
    expect(ranked.length).toBe(4);
    for (let i = 0; i < ranked.length - 1; i++) {
      expect(ranked[i].score).toBeGreaterThanOrEqual(ranked[i + 1].score);
    }
  });

  it("fairly rewards high margin relative to sector peers", () => {
    // RETAIL1 has 8% margin in a 7% sector (outperformer)
    // TECH2 has 21% margin in a 23% sector (underperformer)
    const retailBench = { medianOperatingMargin: 7, medianRoe: 16 };
    const techBench = { medianOperatingMargin: 23, medianRoe: 25 };

    const retailScore = calculatePersonalityScore("buffett", FIXTURE_UNIVERSE[2], retailBench);
    const techScore = calculatePersonalityScore("buffett", FIXTURE_UNIVERSE[1], techBench);

    // Both should receive valid scores and retail should not be penalized just for lower absolute margin
    expect(retailScore).toBeGreaterThan(60);
    expect(techScore).toBeGreaterThan(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/personality-ranker.test.ts`
Expected: FAIL ("Cannot find module '../src/engines/personality-ranker.js'")

- [ ] **Step 3: Implement `src/engines/personality-ranker.ts`**

Create `src/engines/personality-ranker.ts`:
```ts
import type { Fundamentals } from "../types/index.js";

export interface SectorBenchmark {
  medianOperatingMargin: number;
  medianRoe: number;
}

export type RankedStock = Fundamentals & { score: number };

const DEFAULT_BENCHMARK: SectorBenchmark = {
  medianOperatingMargin: 12.0,
  medianRoe: 15.0,
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

/**
 * Computes sector benchmark statistics (median operating margin and ROE)
 * across the universe.
 */
export function computeSectorMedians(universe: Fundamentals[]): Map<string, SectorBenchmark> {
  const sectorGroups = new Map<string, { margins: number[]; roes: number[] }>();

  for (const s of universe) {
    const sector = s.sector?.trim() || "Other";
    let group = sectorGroups.get(sector);
    if (!group) {
      group = { margins: [], roes: [] };
      sectorGroups.set(sector, group);
    }
    if (typeof s.operatingMargin === "number" && !Number.isNaN(s.operatingMargin)) {
      group.margins.push(s.operatingMargin);
    }
    if (typeof s.roe === "number" && !Number.isNaN(s.roe)) {
      group.roes.push(s.roe);
    }
  }

  const result = new Map<string, SectorBenchmark>();
  for (const [sector, group] of sectorGroups.entries()) {
    result.set(sector, {
      medianOperatingMargin:
        group.margins.length > 0 ? median(group.margins) : DEFAULT_BENCHMARK.medianOperatingMargin,
      medianRoe: group.roes.length > 0 ? median(group.roes) : DEFAULT_BENCHMARK.medianRoe,
    });
  }

  return result;
}

/**
 * Calculates a 0-100 hybrid sector-adjusted personality score.
 */
export function calculatePersonalityScore(
  personalityId: string,
  stock: Fundamentals,
  benchmark: SectorBenchmark,
): number {
  const sectorMargin = benchmark.medianOperatingMargin > 0 ? benchmark.medianOperatingMargin : 12.0;
  const sectorRoe = benchmark.medianRoe > 0 ? benchmark.medianRoe : 15.0;

  const stockMargin = stock.operatingMargin ?? sectorMargin;
  const stockRoe = stock.roe ?? sectorRoe;

  // Normalized ratios against sector benchmark (range 0.5 to 2.0)
  const marginRatio = clamp(stockMargin / sectorMargin, 0.5, 2.0);
  const roeRatio = clamp(stockRoe / sectorRoe, 0.5, 2.0);

  let rawScore = 50;

  switch (personalityId) {
    case "buffett": {
      // Quality compounder: sector margin (35%), sector ROE (35%), low leverage (30%)
      const marginPts = (marginRatio / 2.0) * 35;
      const roePts = (roeRatio / 2.0) * 35;
      const de = clamp(stock.debtToEquity ?? 0.5, 0, 0.5);
      const debtPts = (1 - de / 0.5) * 30;
      rawScore = marginPts + roePts + debtPts;
      break;
    }
    case "munger": {
      // High-quality moat at reasonable valuation
      const roePts = (roeRatio / 2.0) * 40;
      const pe = clamp(stock.peRatio ?? 35, 0, 35);
      const pePts = (1 - pe / 35) * 35;
      const de = clamp(stock.debtToEquity ?? 0.5, 0, 0.5);
      const debtPts = (1 - de / 0.5) * 25;
      rawScore = roePts + pePts + debtPts;
      break;
    }
    case "lych": {
      // Growth at a reasonable price (GARP)
      const growth = stock.revenueGrowth ?? (stock.netProfit ? 10 : 0);
      const pe = stock.peRatio ?? 25;
      const peg = pe / Math.max(growth, 1);
      const pegPts = clamp(1 - (peg - 1) / 2, 0, 1) * 40;
      const roePts = (roeRatio / 2.0) * 30;
      const growthPts = clamp(growth / 30, 0.33, 1.0) * 30;
      rawScore = pegPts + roePts + growthPts;
      break;
    }
    case "graham": {
      // Deep value: PE discount (35%), PB discount (35%), dividend yield (15%), margin stability (15%)
      const pe = clamp(stock.peRatio ?? 15, 0, 15);
      const pePts = (1 - pe / 15) * 35;
      const pb = clamp(stock.pbRatio ?? 1.5, 0, 1.5);
      const pbPts = (1 - pb / 1.5) * 35;
      const divYield = clamp(stock.dividendYield ?? 1, 0, 5);
      const divPts = (divYield / 5) * 15;
      const marginPts = (marginRatio / 2.0) * 15;
      rawScore = pePts + pbPts + divPts + marginPts;
      break;
    }
    case "greenblatt": {
      // Magic Formula: Earnings Yield (1/PE) + Sector Return on Capital (ROE)
      const pe = clamp(stock.peRatio ?? 20, 5, 20);
      const eyPts = clamp((1 / pe) / (1 / 8), 0.25, 1.0) * 40;
      const roePts = (roeRatio / 2.0) * 40;
      const de = clamp(stock.debtToEquity ?? 0.5, 0, 0.5);
      const debtPts = (1 - de / 0.5) * 20;
      rawScore = eyPts + roePts + debtPts;
      break;
    }
    case "klarman": {
      // Margin of safety: PB discount, low debt, sector ROE
      const pb = clamp(stock.pbRatio ?? 2.0, 0, 2.0);
      const pbPts = (1 - pb / 2.0) * 45;
      const de = clamp(stock.debtToEquity ?? 0.5, 0, 0.5);
      const debtPts = (1 - de / 0.5) * 30;
      const roePts = (roeRatio / 2.0) * 25;
      rawScore = pbPts + debtPts + roePts;
      break;
    }
    case "dividend": {
      // High sustainable dividend yield + quality
      const divYield = clamp(stock.dividendYield ?? 2.5, 0, 7.0);
      const divPts = (divYield / 7.0) * 45;
      const roePts = (roeRatio / 2.0) * 30;
      const pe = clamp(stock.peRatio ?? 25, 0, 25);
      const pePts = (1 - pe / 25) * 25;
      rawScore = divPts + roePts + pePts;
      break;
    }
    case "momentum": {
      // Strong revenue growth with high sector-relative margin & ROE
      const growth = clamp(stock.revenueGrowth ?? 15, 0, 40);
      const growthPts = (growth / 40) * 35;
      const marginPts = (marginRatio / 2.0) * 35;
      const roePts = (roeRatio / 2.0) * 30;
      rawScore = growthPts + marginPts + roePts;
      break;
    }
    default: {
      rawScore = (marginRatio / 2.0) * 50 + (roeRatio / 2.0) * 50;
      break;
    }
  }

  return Math.round(clamp(rawScore, 0, 100));
}

/**
 * Filters the universe by personality screener criteria, computes sector-adjusted
 * scores for matched candidates, and returns them sorted descending by score.
 */
export function rankPersonalityCandidates(
  personalityId: string,
  filter: (s: Fundamentals) => boolean,
  universe: Fundamentals[],
): RankedStock[] {
  const sectorMedians = computeSectorMedians(universe);
  const matched = universe.filter(filter);

  const ranked: RankedStock[] = matched.map((stock) => {
    const sector = stock.sector?.trim() || "Other";
    const benchmark = sectorMedians.get(sector) ?? DEFAULT_BENCHMARK;
    const score = calculatePersonalityScore(personalityId, stock, benchmark);
    return {
      ...stock,
      score,
    };
  });

  return ranked.sort((a, b) => b.score - a.score);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/personality-ranker.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engines/personality-ranker.ts tests/personality-ranker.test.ts
git commit -m "feat: add hybrid sector-adjusted personality ranker engine"
```

---

### Task 2: Server API Integration for Ranked Personalities

**Files:**
- Modify: `src/server.ts:130-168`
- Test: `tests/server.test.ts`

**Interfaces:**
- Consumes: `rankPersonalityCandidates` from `src/engines/personality-ranker.js`
- Produces: `GET /api/personalities` and `GET /api/personalities/:id` return `stocks` array where each stock has `score: number`, ordered descending by `score`.

- [ ] **Step 1: Write test in `tests/server.test.ts` for ranked candidates and score**

Add test in `tests/server.test.ts`:
```ts
it("GET /api/personalities returns candidate stocks with score sorted descending", async () => {
  const res = await fetch(`${baseUrl}/api/personalities`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { personalities: Array<{ id: string; stocks: Array<{ symbol: string; score: number }> }> };
  expect(body.personalities.length).toBeGreaterThan(0);
  for (const p of body.personalities) {
    if (p.stocks.length > 1) {
      for (let i = 0; i < p.stocks.length - 1; i++) {
        expect(p.stocks[i].score).toBeGreaterThanOrEqual(p.stocks[i + 1].score);
      }
    }
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/server.test.ts`
Expected: FAIL (stocks do not contain `score`)

- [ ] **Step 3: Update `src/server.ts` to use `rankPersonalityCandidates`**

Import `rankPersonalityCandidates`:
```ts
import { rankPersonalityCandidates } from "./engines/personality-ranker.js";
```
Update routes:
```ts
  if (pathname === "/api/personalities") {
    try {
      const universe = await deps.getFundamentals();
      const result = PERSONALITIES.map((p) => {
        const rankedStocks = rankPersonalityCandidates(p.id, p.filter, universe);
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          matches: rankedStocks.length,
          stocks: rankedStocks,
        };
      });
      sendJson(res, 200, { total: universe.length, personalities: result });
    } catch (e) {
      sendJson(res, 500, {
        error: e instanceof Error ? e.message : "Failed to load personalities",
        personalities: [],
        total: 0,
      });
    }
    return;
  }

  if (pathname.startsWith("/api/personalities/")) {
    const id = pathname.split("/").pop();
    const personality = PERSONALITIES.find((p) => p.id === id);
    if (!personality) {
      sendJson(res, 404, { error: `Unknown personality: ${id}` });
      return;
    }
    const universe = await deps.getFundamentals();
    const rankedStocks = rankPersonalityCandidates(personality.id, personality.filter, universe);
    sendJson(res, 200, {
      id: personality.id,
      name: personality.name,
      description: personality.description,
      total: universe.length,
      matches: rankedStocks.length,
      stocks: rankedStocks,
    });
    return;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/server.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server.ts tests/server.test.ts
git commit -m "feat: return ranked candidate stocks with hybrid scores in personalities API"
```

---

### Task 3: Interactive Table Sorting, Sector Filter Dropdown, and Op Margin/Score Columns

**Files:**
- Modify: `public/app.js:90-170`
- Modify: `public/style.css`

**Interfaces:**
- Consumes: `active.stocks` with `score` and `operatingMargin`
- Produces:
  - Sector filter `<select id="personality-sector-filter">`
  - Sortable table headers (`th[data-sort]`) with active indicator
  - Score badge and Operating Margin column
  - Smooth client-side re-sorting without full refresh

- [ ] **Step 1: Update `public/app.js` with table sorting and sector filtering**

In `public/app.js`:
Add state for personality detail view:
```js
let personalityTableState = {
  activePersonalityId: null,
  sortColumn: "score",
  sortDirection: "desc",
  sectorFilter: "ALL",
};
```

Update `renderPersonalityDetail(active, total)`:
- Extract all unique sectors from `active.stocks` with counts.
- Filter stocks by `personalityTableState.sectorFilter`.
- Sort filtered stocks by `personalityTableState.sortColumn` and `personalityTableState.sortDirection`.
- Render:
  - Header with title, description, match pill, and Sector dropdown `<select id="personality-sector-filter">`.
  - Table headers: `Symbol`, `Market Cap`, `PE`, `ROE`, `Op Margin`, `Sector`, `Score`, `Action` with `.sortable` class and sort indicator.
  - Rows with formatted `Op Margin` (`${s.operatingMargin.toFixed(1)}%`) and `Score` badge (`<span class="score-badge ${s.score >= 80 ? 'score-high' : s.score >= 60 ? 'score-mid' : 'score-low'}">${s.score}</span>`).
  - Event listeners for sector dropdown change and header clicks to toggle sort column/direction.

- [ ] **Step 2: Add visual styling in `public/style.css`**

Add CSS styles:
```css
.personality-detail-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.personality-sector-filter {
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  font-size: 0.85rem;
}

th.sortable {
  cursor: pointer;
  user-select: none;
  transition: color 0.15s ease;
}

th.sortable:hover {
  color: var(--accent-color, #3b82f6);
}

.sort-indicator {
  display: inline-block;
  margin-left: 0.35rem;
  font-size: 0.75rem;
  opacity: 0.7;
}

.score-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.2rem;
  padding: 0.2rem 0.5rem;
  border-radius: 9999px;
  font-weight: 700;
  font-size: 0.82rem;
}

.score-high {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.score-mid {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.score-low {
  background: rgba(148, 163, 184, 0.15);
  color: #94a3b8;
  border: 1px solid rgba(148, 163, 184, 0.3);
}
```

- [ ] **Step 3: Run Biome check to verify formatting and linting**

Run: `pnpm check`
Expected: PASS (0 errors, 0 warnings)

- [ ] **Step 4: Commit**

```bash
git add public/app.js public/style.css
git commit -m "feat: add interactive table sorting, sector filter dropdown, and score badges"
```

---

### Task 4: Full Verification and Quality Assurance

**Files:**
- All touched files in `src/`, `tests/`, `public/`

- [ ] **Step 1: Run comprehensive lint and type checks**

Run: `pnpm check`
Expected: PASS (Biome check passed, `tsc --noEmit` passed)

- [ ] **Step 2: Run all automated tests**

Run: `pnpm test`
Expected: PASS (All test suites pass)

- [ ] **Step 3: Run dev server smoke test**

Run: `pnpm dev:server` (for 3 seconds)
Verify `GET http://localhost:8787/api/personalities` returns 200 with stocks ordered by score descending.

- [ ] **Step 4: Commit and finalize**

```bash
git add .
git commit -m "chore: verify full test suite passes for personality ranking and sorting"
```
