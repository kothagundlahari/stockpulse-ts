import axios from "axios";
import crypto from "crypto";
import { EventEmitter } from "events";

export interface FyersConfig {
  appId: string;
  secretKey: string;
  redirectUri: string;
}

interface FyersResponse<T = unknown> {
  s: string;
  code: number;
  message: string;
  data: T;
}

interface AuthResponse extends FyersResponse {
  data: {
    access_token: string;
    refresh_token: string;
  };
}

/**
 * FYERS API v3 client with OAuth2 authentication.
 * Provides quotes and order placement for live trading.
 */
export class FyersClient extends EventEmitter {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private readonly baseUrl = "https://api-t1.fyers.in/api/v3";

  constructor(private config: FyersConfig) {
    super();
  }

  get isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  /** Build the OAuth authorization URL the user must open in a browser. */
  getAuthUrl(): string {
    return `https://api-t1.fyers.in/api/v3/generate-authcode?client_id=${this.config.appId}&redirect_uri=${encodeURIComponent(
      this.config.redirectUri
    )}&response_type=code&state=stockpulse`;
  }

  /** Exchange the auth code received on the redirect URI for tokens. */
  async authenticate(authCode: string): Promise<void> {
    const appIdHash = crypto
      .createHash("sha256")
      .update(`${this.config.appId}:${this.config.secretKey}`)
      .digest("hex");

    const response = await axios.post<AuthResponse>(
      `${this.baseUrl}/validate-authcode`,
      {
        grant_type: "authorization_code",
        appIdHash,
        code: authCode,
      }
    );

    if (response.data.s !== "ok") {
      throw new Error(`Authentication failed: ${response.data.message}`);
    }

    this.accessToken = response.data.data.access_token;
    this.refreshToken = response.data.data.refresh_token;
    this.emit("authenticated");
  }

  /** Refresh an expired access token. */
  async refreshAuthToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error("No refresh token available");
    }

    const appIdHash = crypto
      .createHash("sha256")
      .update(`${this.config.appId}:${this.config.secretKey}`)
      .digest("hex");

    const response = await axios.post<AuthResponse>(
      `${this.baseUrl}/validate-refresh_token`,
      {
        grant_type: "refresh_token",
        appIdHash,
        refresh_token: this.refreshToken,
      }
    );

    if (response.data.s !== "ok") {
      throw new Error(`Token refresh failed: ${response.data.message}`);
    }

    this.accessToken = response.data.data.access_token;
    this.emit("refreshed");
  }

  /** Fetch a live quote for a symbol. */
  async getQuote(symbol: string): Promise<FyersResponse> {
    this.requireAuth();
    const response = await axios.get<FyersResponse>(`${this.baseUrl}/quotes`, {
      params: { symbols: `NSE:${symbol}` },
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    return response.data;
  }

  /** Place a market or limit order. */
  async placeOrder(params: {
    symbol: string;
    qty: number;
    side: "BUY" | "SELL";
    type: "LIMIT" | "MARKET" | "SL" | "SL-M";
    limitPrice?: number;
    productType?: "CNC" | "INTRADAY" | "MARGIN";
  }): Promise<FyersResponse> {
    this.requireAuth();
    const response = await axios.post<FyersResponse>(
      `${this.baseUrl}/orders`,
      {
        symbol: `NSE:${params.symbol}`,
        qty: params.qty,
        side: params.side,
        type: params.type,
        limitPrice: params.limitPrice,
        productType: params.productType ?? "INTRADAY",
        validity: "DAY",
      },
      { headers: { Authorization: `Bearer ${this.accessToken}` } }
    );
    return response.data;
  }

  private requireAuth(): void {
    if (!this.accessToken) {
      throw new Error("Not authenticated. Run `stockpulse auth` first.");
    }
  }
}
