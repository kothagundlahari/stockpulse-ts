import type { Holding, Order, PlaceOrderParams, Position } from "../types/index.js";

export type { Holding, Order, PlaceOrderParams, Position };

export interface Broker {
  readonly name: string;
  isAuthenticated: boolean;
  getAuthUrl(state?: string): string;
  authenticate(code: string): Promise<void>;
  getHoldings(): Promise<Holding[]>;
  getPositions(): Promise<Position[]>;
  getOrders(): Promise<Order[]>;
  placeOrder(params: PlaceOrderParams & { confirm: true }): Promise<{ id: string }>;
}
