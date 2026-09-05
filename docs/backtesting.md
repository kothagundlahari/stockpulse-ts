# Backtesting

The backtesting engine (`src/engines/backtest.ts`) simulates a strategy over historical price data. The engine is pure logic with no I/O.

## How it works

The engine is built around a **pure strategy function**:

```ts
type Signal = "BUY" | "SELL" | "HOLD";
type Strategy = (prices: DailyPrice[], index: number) => Signal;
```

Processing is **sequential** (index 0 to N), which guarantees **no look-ahead bias** — the strategy only ever sees data up to and including the current day.

For each day:
1. Ask the strategy for a signal
2. On `BUY` (when flat): buy as many whole shares as cash allows, at the day's **close**
3. On `SELL` (when long): sell the position, recording a Round-trip and P&L
4. Record the day's total equity (cash + position value) on the equity curve
5. Track the running max drawdown

At the end, any open position is closed at the last available close so the result is fully realized.

## Metrics computed

| Metric | Description |
|---|---|
| `initialCapital` / `finalCapital` | Start and end cash |
| `totalReturn` | Overall % return |
| `roundTrips` | Completed simulated entry/exit pairs with P&L |
| `equityCurve` | Per-day portfolio value (for charts) |
| `winRate` | % of closed Round-trips that were profitable |
| `maxDrawdown` | Largest peak-to-trough % drop |

## Using it via the API

The backtest is exposed through `GET /api/backtest` on the dashboard:

```
GET /api/backtest?symbol=TCS&range=1y
```

The `range` parameter maps to Yahoo Finance ranges: `1d`, `5d`, `1mo`, `3mo`, `6mo`, `1y`, `2y`, `5y`, `10y`, `ytd`, `max`.

## Built-in strategies

The engine itself accepts any strategy function. The server ships two:

### Buy-and-hold
Enters on day 0 and holds to the end. Useful as a baseline to beat.

### SMA crossover (default)
Buys when the 10-day SMA crosses above the 20-day SMA, sells when it crosses below.

## Example output

```
Backtesting TCS (1y)...

Initial capital:  ₹100,000
Final capital:    ₹124,560
Total return:     +24.56%
Max drawdown:     -8.40%
Total round-trips: 6
Win rate:         66.7%
```

## Design notes

- **No slippage/costs are modeled** in this version — a deliberate simplification. Adding them is a matter of subtracting a cost per Round-trip; the engine's Round-trip records make that straightforward.
- The engine is **pure and dependency-free**, so it's fully unit-testable (see `tests/backtest.test.ts`) and can be reused from any interface.
- Because the strategy is injected, you can implement mean-reversion, momentum, RSI, or any custom rule without touching the engine.
