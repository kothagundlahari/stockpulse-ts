# Backtesting

The backtesting engine (`src/engines/backtest.ts`) simulates a strategy over historical price data.

## How it works

The engine is built around a **pure strategy function**:

```ts
type Signal = "BUY" | "SELL" | "HOLD";
type Strategy = (prices: DailyPrice[], index: number) => Signal;
```

Processing is **sequential** (index 0 → N), which guarantees **no look-ahead bias** — the strategy only ever sees data up to and including the current day.

For each day:
1. Ask the strategy for a signal
2. On `BUY` (when flat): buy as many whole shares as cash allows, at the day's **close**
3. On `SELL` (when long): sell the position, recording a trade and P&L
4. Record the day's total equity (cash + position value) on the equity curve
5. Track the running max drawdown

At the end, any open position is closed at the last available close so the result is fully realized.

## Metrics computed

| Metric | Description |
|---|---|
| `initialCapital` / `finalCapital` | Start and end cash |
| `totalReturn` | Overall % return |
| `trades` | Full buy/sell history with P&L |
| `equityCurve` | Per-day portfolio value (for charts) |
| `winRate` | % of closed trades that were profitable |
| `maxDrawdown` | Largest peak-to-trough % drop |

## Built-in strategies (in the CLI)

The engine itself accepts any strategy function. The CLI ships two:

### Buy-and-hold
Enters on day 0 and holds to the end. Useful as a baseline to beat.

### SMA crossover
Buys when the 10-day SMA crosses above the 20-day SMA, sells when it crosses below.

```bash
node dist/cli/index.js backtest TCS --strategy sma_crossover --range 1y
```

The `--range` option maps to Yahoo Finance ranges: `1mo`, `3mo`, `6mo`, `1y`, `2y`, `5y`.

## Example output

```
Backtesting TCS (1y)...

Initial capital:  ₹100,000
Final capital:    ₹124,560
Total return:     +24.56%
Max drawdown:     -8.40%
Total trades:     6
Win rate:         66.7%
```

## Design notes

- **No slippage/costs are modeled** in this version — a deliberate simplification. Adding them is a matter of subtracting a cost per trade; the engine's trade records make that straightforward.
- The engine is **pure and dependency-free**, so it's fully unit-testable (see `tests/backtest.test.ts`) and can be reused from any UI later.
- Because the strategy is injected, you can implement mean-reversion, momentum, RSI, or any custom rule without touching the engine.
