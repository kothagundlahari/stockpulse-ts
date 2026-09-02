import { EventEmitter } from "node:events";
import { type Connect, type Exchanges, KiteConnect } from "kiteconnect";

export interface KiteConfig {
  apiKey: string;
  apiSecret: string;
  redirectUri: string;
  exchange?: "NSE" | "BSE" | "NFO" | "BFO" | "CDS" | "MCX";
}

/**
 * Zerodha Kite Connect client. Uses the official `kiteconnect` SDK for the
 * handshake and request signing; this service wraps it with the same
 * EventEmitter + config shape as the FYERS client so the CLI can treat
 * both brokers uniformly.
 *
 * Kite Connect provides realtime quotes to retail accounts at no extra cost
 * (unlike FYERS), which makes it well suited to live screeners.
 */
export class KiteConnectService extends EventEmitter {
  private client: Connect;
  private readonly exchange: Exchanges;
  private token: string | null = null;

  constructor(private config: KiteConfig) {
    super();
    this.exchange = config.exchange ?? "NSE";
    this.client = new KiteConnect({ api_key: config.apiKey });
  }

  get isAuthenticated(): boolean {
    return this.token !== null;
  }

  /** URL the user opens in a browser to authorize the app. */
  getAuthUrl(): string {
    // Redirect URI is appended by the user manually if needed; the SDK builds
    // the base login URL from the configured login_uri.
    const base = this.client.getLoginURL();
    return `${base}&redirect_url=${encodeURIComponent(this.config.redirectUri)}`;
  }

  /** Exchange the request_token from the login redirect for an access token. */
  async authenticate(requestToken: string): Promise<{ user_id: string }> {
    if (!this.config.apiSecret) {
      throw new Error("Kite apiSecret is required to exchange the request token");
    }
    const session = await this.client.generateSession(requestToken, this.config.apiSecret);
    this.token = session.access_token;
    this.client.setAccessToken(session.access_token);
    this.emit("authenticated");
    return { user_id: session.user_id };
  }

  /** Restore a previously stored access token (typical token life: until 6 AM). */
  setAccessToken(token: string): void {
    this.token = token;
    this.client.setAccessToken(token);
    this.emit("authenticated");
  }

  /** Fetch a live quote for one or more symbols (NSE prefix). */
  async getQuote(symbols: string | string[]): Promise<Record<string, unknown>> {
    this.requireAuth();
    const list = Array.isArray(symbols) ? symbols : [symbols];
    const keyed = list.map((s) => `${this.exchange}:${s}`);
    return this.client.getQuote(keyed);
  }

  /** Place a market or limit order. */
  async placeOrder(params: {
    symbol: string;
    qty: number;
    side: "BUY" | "SELL";
    type: "LIMIT" | "MARKET" | "SL" | "SL-M";
    limitPrice?: number;
    product?: "CNC" | "INTRADAY" | "MARGIN";
    validity?: "DAY" | "IOC";
  }): Promise<{ order_id: string }> {
    this.requireAuth();
    const C = this.client;
    const product =
      params.product === "INTRADAY"
        ? C.PRODUCT_MIS
        : params.product === "MARGIN"
          ? C.PRODUCT_NRML
          : C.PRODUCT_CNC;
    const orderType =
      params.type === "MARKET"
        ? C.ORDER_TYPE_MARKET
        : params.type === "SL"
          ? C.ORDER_TYPE_SL
          : params.type === "SL-M"
            ? C.ORDER_TYPE_SLM
            : C.ORDER_TYPE_LIMIT;
    return this.client.placeOrder(C.VARIETY_REGULAR, {
      exchange: this.exchange,
      tradingsymbol: params.symbol,
      transaction_type: params.side === "BUY" ? C.TRANSACTION_TYPE_BUY : C.TRANSACTION_TYPE_SELL,
      quantity: params.qty,
      product,
      order_type: orderType,
      validity: params.validity === "IOC" ? C.VALIDITY_IOC : C.VALIDITY_DAY,
      price: params.type === "LIMIT" || params.type === "SL" ? (params.limitPrice ?? 0) : 0,
    });
  }

  private requireAuth(): void {
    if (!this.token) {
      throw new Error(
        "Not authenticated. Run the login flow and set the access token (see `stockpulse kite`) first.",
      );
    }
  }
}
