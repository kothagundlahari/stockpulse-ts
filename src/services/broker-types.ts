export interface Holding {
  symbol: string;
  quantity: number;
  averagePrice: number;
  ltp: number;
  pnl: number;
  pnlPercent: number;
  dayChange: number;
  dayChangePercent: number;
  currentValue: number;
}

export interface Position {
  symbol: string;
  quantity: number;
  averagePrice: number;
  ltp: number;
  pnl: number;
}

export interface Order {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  status: string;
  timestamp: string;
}

export interface PlaceOrderParams {
  symbol: string;
  qty: number;
  side: "BUY" | "SELL";
  type: "LIMIT" | "MARKET";
  limitPrice?: number;
}

export interface Broker {
  readonly name: string;
  isAuthenticated: boolean;
  getAuthUrl(): string;
  authenticate(code: string): Promise<void>;
  getHoldings(): Promise<Holding[]>;
  getPositions(): Promise<Position[]>;
  getOrders(): Promise<Order[]>;
  placeOrder(params: PlaceOrderParams & { confirm: true }): Promise<{ id: string }>;
}
