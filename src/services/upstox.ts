import axios from "axios";
import {
  type Holding,
  HoldingSchema,
  type Order,
  type OrderRequest,
  OrderSchema,
  type Position,
  PositionSchema,
} from "../types/index.js";
import type { Broker } from "./broker-types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function venueRows(payload: unknown): Record<string, unknown>[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return [];
  return payload.data.map((row) => (isRecord(row) ? row : {}));
}

function venueString(row: Record<string, unknown>, key: string): string {
  return String(row[key] ?? "");
}

function venueNumber(row: Record<string, unknown>, key: string): number {
  return Number(row[key]);
}

export interface UpstoxConfig {
  apiKey: string;
  apiSecret: string;
  redirectUri: string;
  accessToken?: string;
}

export class UpstoxClient implements Broker {
  readonly name = "upstox";
  private base = "https://api.upstox.com/v2";

  constructor(private config: UpstoxConfig) {}

  get isAuthenticated(): boolean {
    return Boolean(this.config.accessToken);
  }

  getAuthUrl(state?: string): string {
    const base = `https://api.upstox.com/v2/login/authorization/dialog?client_id=${encodeURIComponent(
      this.config.apiKey,
    )}&redirect_uri=${encodeURIComponent(this.config.redirectUri)}&response_type=code`;
    return state ? `${base}&state=${encodeURIComponent(state)}` : base;
  }

  async authenticate(code: string): Promise<void> {
    const res = await axios.post("https://api.upstox.com/v2/login/authorization/token", {
      code,
      client_id: this.config.apiKey,
      client_secret: this.config.apiSecret,
      redirect_uri: this.config.redirectUri,
      grant_type: "authorization_code",
    });
    this.config.accessToken = res.data.access_token;
  }

  getAccessToken(): string {
    return this.config.accessToken ?? "";
  }

  private headers(): Record<string, string> {
    if (!this.config.accessToken) {
      throw new Error("Not authenticated. Complete the Upstox OAuth flow first.");
    }
    return { Authorization: `Bearer ${this.config.accessToken}` };
  }

  async getHoldings(): Promise<Holding[]> {
    const res = await axios.get(`${this.base}/portfolio/long-term-holdings`, {
      headers: this.headers(),
    });
    const rows = venueRows(res.data);
    return rows.map((h) =>
      HoldingSchema.parse({
        symbol: venueString(h, "tradingsymbol"),
        quantity: venueNumber(h, "quantity"),
        averagePrice: venueNumber(h, "average_price"),
        ltp: Number(h.close_price ?? h.ltp),
        pnl: Number(h.pnl ?? 0),
        pnlPercent: Number(h.pnl_percent ?? 0),
        dayChange: Number(h.day_change ?? 0),
        dayChangePercent: Number(h.day_change_percent ?? 0),
        currentValue: Number(h.current_value ?? Number(h.close_price) * Number(h.quantity)),
      }),
    );
  }

  async getPositions(): Promise<Position[]> {
    const res = await axios.get(`${this.base}/portfolio/short-term-positions`, {
      headers: this.headers(),
    });
    const rows = venueRows(res.data);
    return rows.map((p) =>
      PositionSchema.parse({
        symbol: venueString(p, "tradingsymbol"),
        quantity: venueNumber(p, "quantity"),
        averagePrice: venueNumber(p, "average_price"),
        ltp: Number(p.close_price ?? p.ltp),
        pnl: Number(p.pnl ?? 0),
      }),
    );
  }

  async getOrders(): Promise<Order[]> {
    const res = await axios.get(`${this.base}/orders`, {
      headers: this.headers(),
    });
    const rows = venueRows(res.data);
    return rows.map((o) =>
      OrderSchema.parse({
        id: venueString(o, "order_id"),
        symbol: venueString(o, "tradingsymbol"),
        side: venueString(o, "transaction_type") === "SELL" ? "SELL" : "BUY",
        qty: venueNumber(o, "quantity"),
        price: venueNumber(o, "price"),
        status: venueString(o, "status"),
        timestamp: venueString(o, "order_timestamp"),
      }),
    );
  }

  async placeOrder(params: OrderRequest): Promise<{ id: string }> {
    if (!params.confirm) {
      throw new Error("Order not confirmed. Pass confirm:true to place a real order.");
    }
    const instrumentToken = await this.resolveInstrumentKey(params.symbol);
    const res = await axios.post(
      `${this.base}/order/place`,
      {
        instrument_token: instrumentToken,
        order_type: params.type === "LIMIT" ? "LIMIT" : "MARKET",
        transaction_type: params.side,
        quantity: params.qty,
        price: params.type === "LIMIT" ? (params.limitPrice ?? 0) : 0,
        validity: "DAY",
        product: "D",
      },
      { headers: this.headers() },
    );
    return { id: String(res.data.data?.order_id ?? "") };
  }

  private async resolveInstrumentKey(symbol: string): Promise<string> {
    const res = await axios.get(`${this.base}/instruments/search/${encodeURIComponent(symbol)}`, {
      headers: this.headers(),
    });
    const rows: Array<Record<string, unknown>> = res.data.data ?? [];
    const match = rows.find(
      (r) => String(r.segment) === "NSE_EQ" && String(r.instrument_type) === "EQ",
    );
    if (match && typeof match.instrument_key === "string" && match.instrument_key) {
      return match.instrument_key;
    }
    throw new Error(
      `Could not resolve Upstox instrument key for symbol "${symbol}". Verify the symbol is valid on NSE.`,
    );
  }
}

export const DEFAULT_UPSTOX_REDIRECT_URI = "https://localhost:8787/callback";

export function createUpstoxClient(accessToken?: string): UpstoxClient {
  return new UpstoxClient({
    apiKey: process.env.UPSTOX_API_KEY ?? "",
    apiSecret: process.env.UPSTOX_API_SECRET ?? "",
    redirectUri: process.env.UPSTOX_REDIRECT_URI ?? DEFAULT_UPSTOX_REDIRECT_URI,
    accessToken,
  });
}
