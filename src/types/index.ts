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

export const HistoricalPriceSchema = z.object({
  date: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
});

export type HistoricalPrice = z.infer<typeof HistoricalPriceSchema>;

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
  revenueGrowth: z.number().optional(),
  sector: z.string().optional(),
});

export type Fundamentals = z.infer<typeof FundamentalsSchema>;

export const CriteriaSchema = z.object({
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
});

export type Criteria = z.infer<typeof CriteriaSchema>;

export const HoldingSchema = z.object({
  symbol: z.string().min(1),
  quantity: z.number(),
  averagePrice: z.number(),
  ltp: z.number(),
  pnl: z.number(),
  pnlPercent: z.number(),
  dayChange: z.number(),
  dayChangePercent: z.number(),
  currentValue: z.number(),
});

export type Holding = z.infer<typeof HoldingSchema>;

export const PositionSchema = z.object({
  symbol: z.string().min(1),
  quantity: z.number(),
  averagePrice: z.number(),
  ltp: z.number(),
  pnl: z.number(),
});

export type Position = z.infer<typeof PositionSchema>;

export const OrderSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().min(1),
  side: z.enum(["BUY", "SELL"]),
  qty: z.number(),
  price: z.number(),
  status: z.string(),
  timestamp: z.string(),
});

export type Order = z.infer<typeof OrderSchema>;

export const PlaceOrderParamsSchema = z.object({
  symbol: z.string().min(1),
  qty: z.number().int().positive(),
  side: z.enum(["BUY", "SELL"]),
  type: z.enum(["LIMIT", "MARKET"]),
  limitPrice: z.number().positive().optional(),
});

export const OrderRequestSchema = PlaceOrderParamsSchema.extend({
  confirm: z.literal(true),
}).superRefine((value, ctx) => {
  if (value.type === "LIMIT" && value.limitPrice == null) {
    ctx.addIssue({
      code: "custom",
      path: ["limitPrice"],
      message: "LIMIT orders require a positive limitPrice",
    });
  }
});

export type OrderRequest = z.infer<typeof OrderRequestSchema>;
