import { z } from "zod";

export const StockSchema = z.object({
  symbol: z.string().min(1),
  name: z.string().min(1),
  exchange: z.enum(["NSE", "BSE"]),
  isin: z.string().optional(),
  sector: z.string().optional(),
  industry: z.string().optional(),
});

export type Stock = z.infer<typeof StockSchema>;

export const QuoteSchema = z.object({
  symbol: z.string(),
  ltp: z.number().nonnegative(),
  change: z.number(),
  changePercent: z.number(),
  open: z.number().nonnegative(),
  high: z.number().nonnegative(),
  low: z.number().nonnegative(),
  previousClose: z.number().nonnegative(),
  volume: z.number().nonnegative(),
  timestamp: z.string().datetime(),
});

export type Quote = z.infer<typeof QuoteSchema>;

export const FundamentalsSchema = z.object({
  symbol: z.string(),
  marketCap: z.number().optional(),
  peRatio: z.number().optional(),
  pbRatio: z.number().optional(),
  dividendYield: z.number().optional(),
  eps: z.number().optional(),
  roe: z.number().optional(),
  debtToEquity: z.number().optional(),
  revenue: z.number().optional(),
  netProfit: z.number().optional(),
  operatingMargin: z.number().optional(),
});

export type Fundamentals = z.infer<typeof FundamentalsSchema>;

export const ScreenerCriteriaSchema = z.object({
  minMarketCap: z.number().optional(),
  maxMarketCap: z.number().optional(),
  minPe: z.number().optional(),
  maxPe: z.number().optional(),
  minPb: z.number().optional(),
  maxPb: z.number().optional(),
  minDividendYield: z.number().optional(),
  minRoe: z.number().optional(),
  minRevenueGrowth: z.number().optional(),
  maxDebtToEquity: z.number().optional(),
  sectors: z.array(z.string()).optional(),
});

export type ScreenerCriteria = z.infer<typeof ScreenerCriteriaSchema>;

export const ScreenerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  criteria: ScreenerCriteriaSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Screener = z.infer<typeof ScreenerSchema>;

export const BacktestConfigSchema = z.object({
  symbol: z.string(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  initialCapital: z.number().positive(),
  strategy: z.enum(["sma_crossover", "momentum", "rsi"]),
  parameters: z.record(z.string(), z.number()).optional(),
});

export type BacktestConfig = z.infer<typeof BacktestConfigSchema>;

export const BacktestResultSchema = z.object({
  config: BacktestConfigSchema,
  totalReturn: z.number(),
  sharpeRatio: z.number(),
  maxDrawdown: z.number(),
  winRate: z.number(),
  totalTrades: z.number(),
  equityCurve: z.array(z.object({ date: z.string(), value: z.number() })),
  trades: z.array(
    z.object({
      entryDate: z.string(),
      entryPrice: z.number(),
      exitDate: z.string(),
      exitPrice: z.number(),
      pnl: z.number(),
    })
  ),
});

export type BacktestResult = z.infer<typeof BacktestResultSchema>;

export const JournalEntrySchema = z.object({
  id: z.string(),
  symbol: z.string(),
  date: z.string().datetime(),
  action: z.enum(["BUY", "SELL"]),
  price: z.number().nonnegative(),
  quantity: z.number().positive(),
  pnl: z.number().optional(),
  notes: z.string().optional(),
  emotions: z.string().optional(),
  lessons: z.string().optional(),
});

export type JournalEntry = z.infer<typeof JournalEntrySchema>;

export const MarketZoneSchema = z.object({
  niftyPe: z.number(),
  indiaVix: z.number(),
  zone: z.enum(["undervalued", "fair", "overvalued"]),
  sentiment: z.enum(["fear", "neutral", "greed"]),
});

export type MarketZone = z.infer<typeof MarketZoneSchema>;
