# Personalities Stock Purchase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users viewing matched stocks in the Personalities tab to click a stock or a "Buy" action button to navigate directly to the Portfolio tab with the trade execution form pre-filled and focused.

**Architecture:** Pure frontend enhancement in `public/app.js` and `public/style.css`. Update `renderPersonalityDetail` in `public/app.js` to render an "Action" column with a compact "Buy" button and clickable symbol button. Attach click event handlers that trigger tab switching to the Portfolio tab, pre-fill `#trade-symbol`, set `#trade-side` to `BUY`, scroll smoothly to the Trade Execution card, and focus `#trade-qty`.

**Tech Stack:** Vanilla JavaScript (ES6+), HTML5, CSS3, Node.js HTTP server, Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-09-04-personalities-stock-purchase-design.md`

## Global Constraints
- TypeScript ESM (`type: module`), relative imports require `.js` extensions.
- All code formatting and linting must pass `pnpm check` (Biome + `tsc --noEmit`).
- All existing tests must pass cleanly (`pnpm test`).
- Preserve existing comments and functions in `public/app.js`.

---

### Task 1: CSS Styling for Personalities Action Elements

**Files:**
- Modify: `public/style.css`

**Interfaces:**
- Consumes: Existing button and table classes in `public/style.css`
- Produces: `.btn-sm`, `.personality-buy-btn`, and `.personality-symbol-btn` class styling

- [ ] **Step 1: Inspect existing button styles in `public/style.css`**
Check the existing `.symbol-btn` and `.btn` styles in `public/style.css` to match fonts, padding, colors, and transitions.

- [ ] **Step 2: Add styles for `.personality-symbol-btn`, `.personality-buy-btn`, and `.btn-sm`**
In `public/style.css`, append:
```css
.personality-symbol-btn {
  background: none;
  border: none;
  padding: 0;
  font-weight: 600;
  color: var(--accent, #2563eb);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
  font-size: inherit;
}

.personality-symbol-btn:hover {
  color: var(--accent-hover, #1d4ed8);
}

.btn-sm {
  padding: 0.25rem 0.6rem;
  font-size: 0.8rem;
  line-height: 1.2;
}

.personality-buy-btn {
  background: #16a34a;
  color: #fff;
  border: 1px solid #15803d;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.15s ease-in-out;
}

.personality-buy-btn:hover {
  background: #15803d;
}
```

- [ ] **Step 3: Verify formatting and syntax**
Run `pnpm check` to ensure `public/style.css` adheres to repo standards.

- [ ] **Step 4: Commit**
```bash
git add public/style.css
git commit -m "style: add personality action and symbol button styles"
```

---

### Task 2: Update Personalities Detail Table Markup in `public/app.js`

**Files:**
- Modify: `public/app.js:80-110`

**Interfaces:**
- Consumes: `renderPersonalityDetail(active, total)`
- Produces: Table with `Action` column, `.personality-symbol-btn`, and `.personality-buy-btn` elements

- [ ] **Step 1: Locate `renderPersonalityDetail` in `public/app.js`**
Review lines 80–110 in `public/app.js`.

- [ ] **Step 2: Update table header and row markup**
Add the `<th>Action</th>` header and include the action column in each row:
```javascript
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Market Cap</th>
                  <th>PE</th>
                  <th>ROE</th>
                  <th>Sector</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${active.stocks
                  .map(
                    (s) =>
                      `<tr>
                        <td>
                          <button type="button" class="personality-symbol-btn" data-symbol="${s.symbol}" title="Click to trade ${s.symbol}">
                            ${s.symbol}
                          </button>
                        </td>
                        <td>${formatMC(s.marketCap)}</td>
                        <td>${num(s.peRatio)}</td>
                        <td class="${typeof s.roe === "number" && s.roe >= 15 ? "positive" : ""}">${typeof s.roe === "number" && !Number.isNaN(s.roe) ? `${s.roe.toFixed(1)}%` : "—"}</td>
                        <td>${s.sector ?? "—"}</td>
                        <td>
                          <button type="button" class="btn btn-sm personality-buy-btn" data-symbol="${s.symbol}">
                            Buy
                          </button>
                        </td>
                      </tr>`,
                  )
                  .join("")}
              </tbody>
            </table>
```

- [ ] **Step 3: Run `pnpm check`**
Ensure no syntax or lint errors.

- [ ] **Step 4: Commit**
```bash
git add public/app.js
git commit -m "feat(ui): add Action column and Buy button to personalities table"
```

---

### Task 3: Implement Navigation and Trade Pre-fill Event Handlers

**Files:**
- Modify: `public/app.js`

**Interfaces:**
- Consumes: Click events on `.personality-buy-btn` and `.personality-symbol-btn`
- Produces: Navigation to Portfolio tab, setting `#trade-symbol`, setting `#trade-side` to `BUY`, scrolling into view, and focusing `#trade-qty`

- [ ] **Step 1: Write helper function `navigateToTrade(symbol)` in `public/app.js`**
Create a shared helper in `public/app.js`:
```javascript
function navigateToTrade(symbol, side = "BUY") {
  const portfolioTabBtn = document.querySelector('.tab-btn[data-tab="portfolio"]');
  if (portfolioTabBtn) {
    portfolioTabBtn.click();
  }

  const symInput = document.getElementById("trade-symbol");
  if (symInput && symbol) {
    symInput.value = symbol;
    symInput.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const sideSelect = document.getElementById("trade-side");
  if (sideSelect) {
    sideSelect.value = side;
  }

  const qtyInput = document.getElementById("trade-qty");
  if (qtyInput) {
    setTimeout(() => {
      qtyInput.focus();
    }, 100);
  }
}
```

- [ ] **Step 2: Wire event handlers in `renderPersonalityDetail` or personality list container**
In `renderPersonalityDetail`:
```javascript
  detailPane.querySelectorAll(".personality-symbol-btn, .personality-buy-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const symbol = btn.dataset.symbol;
      if (symbol) {
        navigateToTrade(symbol, "BUY");
      }
    });
  });
```

- [ ] **Step 3: Re-use `navigateToTrade` in existing portfolio holdings symbol click**
In `renderHoldings`:
Update the existing `.symbol-btn` click handler to leverage `navigateToTrade(symbol, "BUY")` or keep it consistent.

- [ ] **Step 4: Run `pnpm check` and `pnpm test`**
Verify that all lints, types, and tests pass.

- [ ] **Step 5: Commit**
```bash
git add public/app.js
git commit -m "feat(ui): wire personalities stock click to trade navigation and prefill"
```

---

### Task 4: Verification and Smoke Testing

**Files:**
- Verify: `public/app.js`, `public/style.css`

- [ ] **Step 1: Run comprehensive checks**
```bash
pnpm check
pnpm test
```
Verify 0 errors and all test suites pass.

- [ ] **Step 2: Verify user experience**
Confirm:
1. Personalities tab loads with investor screeners.
2. Selecting a personality displays the stocks table with "Action" column containing "Buy" buttons.
3. Clicking "Buy" or stock symbol transitions to Portfolio tab.
4. `#trade-symbol` contains the selected symbol.
5. `#trade-side` is "BUY".
6. `#trade-qty` receives keyboard focus.

- [ ] **Step 3: Commit any final cleanup**
```bash
git status
```
