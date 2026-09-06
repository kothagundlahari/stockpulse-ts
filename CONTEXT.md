# StockPulse

A single-context research dashboard for Indian (NIFTY) equities: it ranks a live Universe, advises on Holdings, and places Orders only when the user confirms.

## Language

### Universe

**Universe**:
The live NIFTY 500 membership — the listed instruments currently under consideration. Membership is replaceable, not a frozen roster. A Screener run observes each member through that member's current Fundamentals (which may be incomplete).
_Avoid_: NIFTY list, stock list, Stocks (when meaning the whole set)

**Stock**:
The identity of a listed instrument — symbol, exchange, name, optional ISIN, sector, and industry. It does not carry financial ratios, a live print, or ownership.
_Avoid_: Fundamentals, company, ticker, Candidate

**Fundamentals**:
A point-in-time snapshot of financial ratios for one Stock (valuation, profitability, leverage, growth). Not an intrinsic property of the Stock.
_Avoid_: Metrics, stats, profile, Stock (when meaning the ratio snapshot)

**Quote**:
A live market print for one symbol — last price, change, session range, volume. Distinct from Fundamentals, from a Historical price, and from a Holding's carried last price.
_Avoid_: Tick, LTP (when meaning the whole print), Historical price

**Historical price**:
One daily OHLCV bar for a symbol. A series of these is how a Recommendation sees recent price, not via Quote.
_Avoid_: Quote, tick, chart (as the concept)

### Screening

**Personality**:
A curated investor philosophy: a `Fundamentals → boolean` match over the Universe plus a sector-relative Score that orders those matches. Developer-defined (e.g. Buffett, Graham), not user-built.
_Avoid_: Personality screener, investor filter, filter, strategy, Criteria

**Criteria**:
A user-built bag of optional min/max thresholds on Fundamentals. The ad-hoc counterpart to a Personality: both select from the Universe; Criteria does not Score.
_Avoid_: Filter, query, params, Personality

**Screener run**:
One application of either a Personality or a Criteria bag to the Universe. A Criteria run yields the passing members' current Fundamentals. A Personality run yields Candidates.
_Avoid_: Scan, search, Stocks (the output is never Stock identity records)

**Candidate**:
A Universe member that passed a Personality run, carrying that Personality's Score. Not the output of a Criteria run, and not a Recommendation — passing a Personality does not imply the user owns it or should buy it.
_Avoid_: Hit, match (as a noun for the row), ranked stock, Recommendation, Stock

**Score**:
A 0–100, sector-relative rank of a Candidate under one Personality. Distinct from Confidence (which grades a Recommendation) and from any internal tally used to pick BUY_MORE / HOLD / SELL.
_Avoid_: Confidence, conviction, rating, rank (as the numeric field)

**Sector benchmark**:
The typical operating margin and ROE of one sector inside the current Universe, used only to compute a Personality Score so sectors are not compared on raw levels.
_Avoid_: Sector average, peer stats, Score

### Decision (research)

**Recommendation**:
An action proposed for a Holding the user already owns — `BUY_MORE` / `HOLD` / `SELL` — graded by Confidence. It is not produced for a Candidate or any unowned Universe member. Acting on it is a separate, manual step; it becomes an Order only when the user confirms. Buying a Candidate is an Order request, not a Recommendation.
_Avoid_: Advice, suggestion, signal, Candidate

**Confidence**:
How strongly a Recommendation is held — low, medium, or high. It grades the Recommendation, not a Candidate.
_Avoid_: Conviction, certainty, Score

**Portfolio**:
The user's Holdings taken together: total value, each Holding's weight as a percent of that total, and a Recommendation on each Holding.
_Avoid_: Account, book, book of positions, Universe

**Weight**:
A Holding's share of Portfolio total value, as a percent. High Weight can push that Holding's Recommendation toward `SELL`. Distinct from Score.
_Avoid_: Allocation, concentration, Score

### Execution

**Holding**:
A long-term, delivered ownership — quantity, average cost, unrealized P/L, current value — carried across sessions. Sourced from the Broker in delivered form. StockPulse Order placement is delivery: a fill updates Holdings, not Positions.
_Avoid_: Position (when meaning long-term), inventory

**Position**:
An open intraday / short-term exposure, not yet delivered. Same economic idea as a Holding (quantity at average cost); the difference is delivered vs still open for the day. The Broker can report Positions; StockPulse does not open them.
_Avoid_: Holding (when meaning intraday), open trade

**Order**:
The execution record of a buy or sell — side, identity, status, time. A Recommendation is a decision; an Order is what happened. An Order may target a symbol that is not a Holding and has no Recommendation.
_Avoid_: Trade, transaction, exchange, Recommendation

**Order request**:
Intent to place an Order, before it exists. Gated by explicit confirmation; no Order is placed without it. Side is `BUY` / `SELL` (not `BUY_MORE` / `HOLD`).
_Avoid_: Order (before it is placed), submission, trade (as the request), Recommendation

**Broker**:
The execution-venue *role*: holdings, positions, orders, and order placement. The live venue today is Upstox; the rest of the product depends on the role, not the venue.
_Avoid_: Upstox (when referring to the role, not the live venue)

**Broker session**:
Whether a Broker is currently authorized to read holdings and accept Order requests. Establishing it is authorization; dropping it is disconnect.
_Avoid_: Token (when meaning the whole session), login, connection

> **Decision vs. execution.** "Buy"/"sell" appears in the decision vocabulary (`Recommendation`) and the execution vocabulary (`Order`, `Order request`) on purpose. A decision never becomes an Order without an explicit, confirmed step. A Personality Candidate is research, not a decision to buy.
