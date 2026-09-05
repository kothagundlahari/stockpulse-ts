# StockPulse

A single-context repo: a TypeScript dashboard for Indian (NIFTY) stock research. This file is a glossary of the domain's canonical terms and the vocabulary that must not be used to mean them.

## Language

**Universe**:
The live, dynamically refreshed set of NIFTY 500 constituents a screener ranks. Fetched from the NSE index CSV; not a hardcoded list.
_Avoid_: NIFTY list, stock list

**Stock**:
A listed instrument identified by `symbol` + `exchange`, carrying identity only — name, ISIN, sector. It holds no financial ratios.
_Avoid_: Fundamentals, company, ticker

**Fundamentals**:
A point-in-time snapshot of financial ratios for one Stock (market cap, P/E, P/B, ROE, etc.). Not an intrinsic property of the Stock; it is captured at a moment and cached.
_Avoid_: Metrics, stats, profile

**Personality**:
A classic investor's philosophy encoded as a `Fundamentals → boolean` test that ranks the Universe. One of a curated, developer-defined set (e.g. `buffett`, `graham`, `klarman`).
_Avoid_: Personality screener, investor filter, filter, strategy

**Criteria** (`ScreenerCriteria`):
A structured bag of optional min/max thresholds on fundamentals that a user builds bespoke in the dashboard. The counterpart to a `Personality`: both filter the Universe, but a `Personality` is curated and a `Criteria` is ad-hoc.
_Avoid_: Filter, query, params

**Screener run**:
Applying a `Personality` filter or a `Criteria` bag over the Universe, producing the matched Stocks.
_Avoid_: Scan, search

**Signal**:
A backtest strategy's decision at one time step on the historical/forward price path — `BUY` / `SELL` / `HOLD`. About what a strategy *would* do on a chart, not about a position the user holds.
_Avoid_: Alert, trigger, recommendation

**Recommendation**:
An action proposed for a holding the user *already* owns — `BUY_MORE` / `HOLD` / `SELL`, graded by a `Confidence` level. Distinct from a `Signal`: it acts on an existing position, not a price chart. Acting on a `Recommendation` is a *separate, manual* step — it produces an `Order` only when the user confirms; it is never auto-executed.
_Avoid_: Advice, suggestion, signal

### Execution (broker & trades)

**Holding**:
A *long-term* position — delivered and carried across sessions — carrying average cost, realized P/L, and current value. Sourced from the broker's long-term holdings.
_Avoid_: Position (when meaning long-term), inventory

**Position**:
An *open intraday / short-term* position, not yet delivered. Distinct from a `Holding`, which is long-term. Shares the same underlying concept (an owned quantity at an average cost); the difference is whether the exposure is delivered or still open for the day.
_Avoid_: Holding (when meaning intraday), open trade

**Order**:
The execution record of an intended buy or sell — a `BUY`/`SELL` with `id`, `status`, and `timestamp`. A `Signal` or `Recommendation` is a *decision*; an `Order` is what *happens*. The words "buy"/"sell" appear in both decision types and `Order`, by design: the decision and the execution are different concepts that must not be conflated.
_Avoid_: Trade, transaction, exchange

**Order request** (`PlaceOrderParams`):
An intent to place an `Order` — the user's request *before* it becomes an `Order`. Gated by an explicit `confirm` flag: an order is never placed without confirmation.
_Avoid_: Order (before it is placed), submission

**Broker**:
The execution-venue abstraction offering holdings, positions, orders, and order placement. Upstox is the concrete implementation; the rest of the app depends on the `Broker` abstraction, not the concrete client.
_Avoid_: Upstox (when referring to the role, not the implementation)

**Broker session**:
The authenticated state of a `Broker` — an OAuth access token stored locally, reflecting whether `isAuthenticated` is true. Establishing it is the OAuth login flow; dropping it is disconnect.
_Avoid_: Token (when meaning the whole session), login, connection

> **Decision vs. execution seam.** "Buy"/"sell" appears in the *decision* vocabulary (`Signal`, `Recommendation`) and the *execution* vocabulary (`Order`, `Order request`), deliberately and in separate types. A decision never becomes an `Order` without an explicit, confirmed step.
