import axios from "axios";
import type { Broker, Holding, Order, PlaceOrderParams, Position } from "./broker-types.js";

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

  getAuthUrl(): string {
    return `https://api.upstox.com/v2/login/authorization/dialog?client_id=${encodeURIComponent(
      this.config.apiKey,
    )}&redirect_uri=${encodeURIComponent(this.config.redirectUri)}&response_type=code`;
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
    const rows = res.data.data ?? [];
    return rows.map((h: Record<string, number | string>) => ({
      symbol: String(h.tradingsymbol),
      quantity: Number(h.quantity),
      averagePrice: Number(h.average_price),
      ltp: Number(h.close_price ?? h.ltp),
      pnl: Number(h.pnl ?? 0),
      pnlPercent: Number(h.pnl_percent ?? 0),
      dayChange: Number(h.day_change ?? 0),
      dayChangePercent: Number(h.day_change_percent ?? 0),
      currentValue: Number(h.current_value ?? Number(h.close_price) * Number(h.quantity)),
    }));
  }

  async getPositions(): Promise<Position[]> {
    const res = await axios.get(`${this.base}/portfolio/short-term-positions`, {
      headers: this.headers(),
    });
    const rows = res.data.data ?? [];
    return rows.map((p: Record<string, number | string>) => ({
      symbol: String(p.tradingsymbol),
      quantity: Number(p.quantity),
      averagePrice: Number(p.average_price),
      ltp: Number(p.close_price ?? p.ltp),
      pnl: Number(p.pnl ?? 0),
    }));
  }

  async getOrders(): Promise<Order[]> {
    const res = await axios.get(`${this.base}/orders`, {
      headers: this.headers(),
    });
    const rows = res.data.data ?? [];
    return rows.map((o: Record<string, number | string>) => ({
      id: String(o.order_id),
      symbol: String(o.tradingsymbol),
      side: String(o.transaction_type) === "SELL" ? "SELL" : "BUY",
      qty: Number(o.quantity),
      price: Number(o.price),
      status: String(o.status),
      timestamp: String(o.order_timestamp),
    }));
  }

  async placeOrder(params: PlaceOrderParams & { confirm: true }): Promise<{ id: string }> {
    if (!params.confirm) {
      throw new Error("Trade not confirmed. Pass confirm:true to place a real order.");
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

export function createUpstoxClient(accessToken?: string): UpstoxClient {
  return new UpstoxClient({
    apiKey: process.env.UPSTOX_API_KEY ?? "",
    apiSecret: process.env.UPSTOX_API_SECRET ?? "",
    redirectUri: process.env.UPSTOX_REDIRECT_URI ?? "http://localhost:8787/callback",
    accessToken,
  });
}
