# StockPulse

A single-context research dashboard for Indian (NIFTY) equities: it ranks a live Universe, advises on Holdings, and places Orders only when the user confirms.

## Language

**Universe**:
The current NIFTY 500 set of listed instruments under consideration. It is live and replaceable, not a frozen roster.
_Avoid_: NIFTY list, stock list

**Stock**:
The identity of a listed instrument — symbol, exchange, name, optional ISIN, sector, and industry. It does not carry financial ratios.
_Avoid_: Fundamentals, company, ticker

**Fundamentals**:
A point-in-time snapshot of financial ratios for one Stock (valuation, profitability, leverage, growth). Not an intrinsic property of the Stock.
_Avoid_: Metrics, stats, profile

**Quote**:
A live market print for one symbol — last price, change, session range, volume. Distinct from Fundamentals (ratios) and from a Holding's carried last price.
_Avoid_: Tick, LTP (when meaning the whole print)

**Personality**:
A curated investor philosophy: a `Fundamentals → boolean` match over the Universe plus a sector-relative score that orders those matches. Developer-defined (e.g. Buffett, Graham), not user-built.
_Avoid_: Personality screener, investor filter, filter, strategy

**Criteria**:
A user-built bag of optional min/max thresholds on Fundamentals. The ad-hoc counterpart to a Personality: both select from the Universe.
_Avoid_: Filter, query, params

**Screener run**:
One application of either a Personality or a Criteria bag to the Universe. Output is the passing members as their current Fundamentals; a Personality run also carries a score.
_Avoid_: Scan, search, Stocks (the output is Fundamentals of Universe members, not Stock identity records)

**Candidate**:
A Universe member that passed a Screener run. For a Personality run it also has a sector-relative score.
_Avoid_: Hit, match (as a noun for the row), ranked stock

**Confidence**:
How strongly a Recommendation is held — low, medium, or high. It grades the Recommendation.
_Avoid_: Conviction, certainty, score (when meaning this grade)

### Decision (research)

**Recommendation**:
An action proposed for a Holding the user already owns — `BUY_MORE` / `HOLD` / `SELL` — graded by Confidence. Acting on it is a separate, manual step; it becomes an Order only when the user confirms.
_Avoid_: Advice, suggestion, signal

**Portfolio**:
The user's Holdings taken together: total value, per-holding weight, and a Recommendation on each Holding.
_Avoid_: Account, book, book of positions

### Execution

**Holding**:
A long-term, delivered ownership — quantity, average cost, realized P/L, current value — carried across sessions. Sourced from the Broker in delivered form.
_Avoid_: Position (when meaning long-term), inventory

**Position**:
An open intraday / short-term exposure, not yet delivered. Same economic idea as a Holding (quantity at average cost); the difference is delivered vs still open for the day.
_Avoid_: Holding (when meaning intraday), open trade

**Order**:
The execution record of a buy or sell — side, identity, status, time. A Recommendation is a decision; an Order is what happened.
_Avoid_: Trade, transaction, exchange

**Order request**:
Intent to place an Order, before it exists. Gated by explicit confirmation; no Order is placed without it.
_Avoid_: Order (before it is placed), submission, trade (as the request)

**Broker**:
The execution-venue *role*: holdings, positions, orders, and order placement. The live venue today is Upstox; the rest of the product depends on the role, not the venue.
_Avoid_: Upstox (when referring to the role, not the live venue)

**Broker session**:
Whether a Broker is currently authorized to read holdings and accept Order requests. Establishing it is authorization; dropping it is disconnect.
_Avoid_: Token (when meaning the whole session), login, connection

> **Decision vs. execution.** "Buy"/"sell" appears in the decision vocabulary (`Recommendation`) and the execution vocabulary (`Order`, `Order request`) on purpose. A decision never becomes an Order without an explicit, confirmed step.
