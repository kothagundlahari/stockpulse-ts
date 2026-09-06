import type { Holding, Order, OrderRequest, Position } from "../types/index.js";

export interface Broker {
  readonly name: string;
  isAuthenticated: boolean;
  getAuthUrl(state?: string): string;
  authenticate(code: string): Promise<void>;
  getHoldings(): Promise<Holding[]>;
  getPositions(): Promise<Position[]>;
  getOrders(): Promise<Order[]>;
  placeOrder(params: OrderRequest): Promise<{ id: string }>;
}
