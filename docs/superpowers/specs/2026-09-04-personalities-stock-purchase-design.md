# Personalities Stock Purchase Workflow Design

**Date:** 2026-09-04  
**Status:** Approved  
**Topic:** Stock purchase workflow from Personalities tab and signal redundancy analysis

---

## 1. Overview & Problem Statement

The StockPulse dashboard offers multiple investor personality screeners (e.g. Warren Buffett, Benjamin Graham, Charlie Munger, Peter Lynch) filtering the NIFTY 500 universe based on strict fundamental criteria.

Two user experience gaps were identified:
1. When viewing candidate stocks matching an investor personality, there is currently no way to act on a stock directly to purchase it. The user has to manually memorize or copy the symbol, switch to the Portfolio tab, and type the symbol into the Trade Execution form.
2. Unclear distinction regarding whether "Buy, Sell, and Hold" recommendation signals belong in the Personalities tab.

---

## 2. Redundancy Analysis: Buy, Sell, and Hold in Personalities

**Conclusion:** Showing "Buy, Sell, and Hold" in Personalities is redundant, misleading, and should **not** be displayed in this tab.

### Rationale:
1. **Screeners are inherently Buy Candidate lists:**  
   Every stock that appears under an investor personality in `GET /api/personalities` has satisfied 100% of that screener's strict criteria (e.g., Benjamin Graham P/E < 10, P/B < 1.5, D/E < 1, Div Yield > 3%). Assigning a "BUY" tag to every row would be a 100% uniform badge with zero discriminating information.
2. **"Sell" and "Hold" require an active position:**  
   The recommendation engine in `src/engines/holding-recommendation.ts` (`recommendHolding`) calculates `BUY_MORE`, `HOLD`, and `SELL` strictly for portfolio holdings by analyzing:
   - Portfolio weight concentration (> 30% triggers trimming/selling).
   - Average purchase price vs. current market price (unrealized P&L).
   - Individual holding risk metrics.
   In an unowned market universe (NIFTY 500), a user cannot "Hold" or "Sell" shares they do not own.
3. **Appropriate signal:**  
   The Personalities tab should focus on candidate discovery and actionable execution, displaying fundamentals (Market Cap, P/E, ROE, Sector) alongside a direct **Buy** action.

---

## 3. Interaction & Workflow Design

### 3.1 Personalities Table UI
In `public/app.js` (`renderPersonalityDetail`):
- Add an **Action** column header (`<th>Action</th>`) to the table in the personality detail view.
- In each stock row:
  - Render the symbol as a clickable button (`.personality-symbol-btn`), similar to the symbol button in the Portfolio tab.
  - Render a distinct, compact **Buy** button:
    ```html
    <button type="button" class="btn btn-sm personality-buy-btn" data-symbol="${s.symbol}">Buy</button>
    ```

### 3.2 Navigation & Form Pre-fill Flow
When the user clicks either the symbol or the "Buy" button:
1. **Switch Tab:** Trigger the click event on the Portfolio tab button (`document.querySelector('.tab-btn[data-tab="portfolio"]')`).
2. **Pre-fill Symbol:** Set the value of the Trade Execution input (`#trade-symbol`) to the clicked stock symbol (e.g., `"RELIANCE"`).
3. **Default Action:** Ensure `#trade-side` is explicitly set to `"BUY"`.
4. **Focus & Scroll:**
   - Smoothly scroll the Trade Execution card into view.
   - Focus the quantity input (`#trade-qty`), allowing the user to immediately enter the desired quantity and review or place the order.

### 3.3 Visual Styling
In `public/style.css`:
- Add `.personality-symbol-btn` styling (cursor pointer, subtle hover highlight, unstyled button appearance similar to `.symbol-btn`).
- Add `.personality-buy-btn` and `.btn-sm` styling:
  - Compact padding (e.g., `0.25rem 0.6rem`), slightly smaller font size (`0.8rem`).
  - Styled with primary accent/success theme consistent with existing dashboard buttons.

---

## 4. Testing & Verification

- **Code Quality & Typecheck:** Run `pnpm check` to ensure Biome formatting/linting passes and TypeScript compiles without errors.
- **Automated Tests:** Run `pnpm test` to ensure no regression in existing tests.
- **Manual Verification:**
  - Launch server (`pnpm dev:server`).
  - Open dashboard, navigate to **Personalities** tab.
  - Verify that each stock in the table displays an Action column with a "Buy" button and a clickable symbol.
  - Click "Buy" for a stock and verify:
    - Automatically switches to the Portfolio tab.
    - Symbol is set in `#trade-symbol`.
    - Side is set to `BUY`.
    - `#trade-qty` receives keyboard focus.
