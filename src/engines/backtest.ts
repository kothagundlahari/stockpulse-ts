export interface DailyPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Trade {
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  pnl: number;
}

export interface BacktestResult {
  initialCapital: number;
  finalCapital: number;
  totalReturn: number;
  trades: Trade[];
  equityCurve: { date: string; value: number }[];
  winRate: number;
  maxDrawdown: number;
}

export type Signal = "BUY" | "SELL" | "HOLD";

function avg(data: DailyPrice[], idx: number, period: number): number {
  let sum = 0;
  for (let i = idx - period + 1; i <= idx; i++) {
    sum += data[i].close;
  }
  return sum / period;
}

/** SMA crossover strategy: BUY when short SMA crosses above long, SELL when below. */
export function smaCrossover(data: DailyPrice[], idx: number): Signal {
  if (idx < 20) return "HOLD";
  const shortSma = avg(data, idx, 10);
  const longSma = avg(data, idx, 20);
  if (shortSma > longSma) return "BUY";
  if (shortSma < longSma) return "SELL";
  return "HOLD";
}

/**
 * Backtesting engine with no look-ahead bias.
 * Processes price data sequentially and applies a strategy function.
 */
export class BacktestEngine {
  run(
    prices: DailyPrice[],
    initialCapital: number,
    strategy: (prices: DailyPrice[], index: number) => Signal,
  ): BacktestResult {
    let cash = initialCapital;
    let position = 0;
    let entryPrice = 0;
    let entryDate = "";
    const trades: Trade[] = [];
    const equityCurve: { date: string; value: number }[] = [];
    let maxEquity = initialCapital;
    let maxDrawdown = 0;

    for (let i = 0; i < prices.length; i++) {
      const signal = strategy(prices, i);
      const currentPrice = prices[i].close;

      if (signal === "BUY" && position === 0) {
        position = Math.floor(cash / currentPrice);
        entryPrice = currentPrice;
        entryDate = prices[i].date;
        cash -= position * currentPrice;
      } else if (signal === "SELL" && position > 0) {
        const pnl = (currentPrice - entryPrice) * position;
        trades.push({
          entryDate,
          entryPrice,
          exitDate: prices[i].date,
          exitPrice: currentPrice,
          pnl,
        });
        cash += position * currentPrice;
        position = 0;
      }

      const equity = cash + position * currentPrice;
      equityCurve.push({ date: prices[i].date, value: equity });
      maxEquity = Math.max(maxEquity, equity);
      const drawdown = ((maxEquity - equity) / maxEquity) * 100;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }

    // Close any open position at end of data
    if (position > 0) {
      const lastPrice = prices[prices.length - 1].close;
      const pnl = (lastPrice - entryPrice) * position;
      trades.push({
        entryDate,
        entryPrice,
        exitDate: prices[prices.length - 1].date,
        exitPrice: lastPrice,
        pnl,
      });
      cash += position * lastPrice;
      position = 0;
    }

    const finalCapital = cash;
    const totalReturn = ((finalCapital - initialCapital) / initialCapital) * 100;
    const winRate =
      trades.length > 0 ? (trades.filter((t) => t.pnl > 0).length / trades.length) * 100 : 0;

    return {
      initialCapital,
      finalCapital,
      totalReturn,
      trades,
      equityCurve,
      winRate,
      maxDrawdown,
    };
  }
}
