import type { Broker, Holding, Order, PlaceOrderParams, Position } from "./broker-types.js";

export interface InMemoryBrokerOptions {
  holdings?: Holding[];
  positions?: Position[];
  orders?: Order[];
  isAuthenticated?: boolean;
  name?: string;
}

/**
 * In-memory Broker adapter for deterministic in-process testing and offline usage.
 * Stores holdings, positions, and orders in memory and enforces ADR-0001 confirmation.
 */
export class InMemoryBroker implements Broker {
  readonly name: string;
  isAuthenticated: boolean;
  private holdings: Holding[];
  private positions: Position[];
  private orders: Order[];
  private nextOrderId = 1;

  constructor(options: InMemoryBrokerOptions = {}) {
    this.name = options.name ?? "in-memory";
    this.isAuthenticated = options.isAuthenticated ?? true;
    this.holdings = options.holdings ? structuredClone(options.holdings) : [];
    this.positions = options.positions ? structuredClone(options.positions) : [];
    this.orders = options.orders ? structuredClone(options.orders) : [];
  }

  getAuthUrl(state?: string): string {
    const base = "https://in-memory-broker.local/oauth/authorize";
    return state ? `${base}?state=${encodeURIComponent(state)}` : base;
  }

  async authenticate(code: string): Promise<void> {
    if (!code) {
      throw new Error("Invalid authorization code");
    }
    this.isAuthenticated = true;
  }

  simulateSessionExpiration(): void {
    this.isAuthenticated = false;
  }

  private assertAuthenticated(): void {
    if (!this.isAuthenticated) {
      throw new Error("Not authenticated. Complete the broker OAuth flow first.");
    }
  }

  async getHoldings(): Promise<Holding[]> {
    this.assertAuthenticated();
    return structuredClone(this.holdings);
  }

  async getPositions(): Promise<Position[]> {
    this.assertAuthenticated();
    return structuredClone(this.positions);
  }

  async getOrders(): Promise<Order[]> {
    this.assertAuthenticated();
    return structuredClone(this.orders);
  }

  setHoldings(holdings: Holding[]): void {
    this.holdings = structuredClone(holdings);
  }

  setPositions(positions: Position[]): void {
    this.positions = structuredClone(positions);
  }

  setOrders(orders: Order[]): void {
    this.orders = structuredClone(orders);
  }

  async placeOrder(params: PlaceOrderParams & { confirm: true }): Promise<{ id: string }> {
    this.assertAuthenticated();
    if (!params.confirm) {
      throw new Error("Trade not confirmed. Pass confirm:true to place a real order.");
    }
    if (!params.symbol || typeof params.symbol !== "string") {
      throw new Error("Invalid symbol.");
    }
    if (params.qty <= 0 || !Number.isInteger(params.qty)) {
      throw new Error("Invalid qty. Must be a positive integer.");
    }

    const orderPrice =
      params.type === "LIMIT" && params.limitPrice !== undefined && params.limitPrice > 0
        ? params.limitPrice
        : (this.holdings.find((h) => h.symbol === params.symbol)?.ltp ?? 100);

    const orderId = `inmem-ord-${this.nextOrderId++}`;
    const order: Order = {
      id: orderId,
      symbol: params.symbol,
      side: params.side,
      qty: params.qty,
      price: orderPrice,
      status: "COMPLETE",
      timestamp: new Date().toISOString(),
    };

    this.orders.push(order);
    this.applyToHoldings(params.side, params.symbol, params.qty, orderPrice);
    this.applyToPositions(params.side, params.symbol, params.qty, orderPrice);

    return { id: orderId };
  }

  private applyToHoldings(
    side: "BUY" | "SELL",
    symbol: string,
    qty: number,
    orderPrice: number,
  ): void {
    const existingHoldingIndex = this.holdings.findIndex((h) => h.symbol === symbol);
    if (side === "BUY") {
      const existing = existingHoldingIndex >= 0 ? this.holdings[existingHoldingIndex] : undefined;
      if (existing) {
        const newQty = existing.quantity + qty;
        const newAvg = (existing.quantity * existing.averagePrice + qty * orderPrice) / newQty;
        const currentVal = newQty * existing.ltp;
        const pnl = currentVal - newQty * newAvg;
        const pnlPercent = (pnl / (newQty * newAvg)) * 100;
        this.holdings[existingHoldingIndex] = {
          ...existing,
          quantity: newQty,
          averagePrice: newAvg,
          currentValue: currentVal,
          pnl,
          pnlPercent,
        };
      } else {
        const currentVal = qty * orderPrice;
        this.holdings.push({
          symbol,
          quantity: qty,
          averagePrice: orderPrice,
          ltp: orderPrice,
          pnl: 0,
          pnlPercent: 0,
          dayChange: 0,
          dayChangePercent: 0,
          currentValue: currentVal,
        });
      }
      return;
    }

    const existing = existingHoldingIndex >= 0 ? this.holdings[existingHoldingIndex] : undefined;
    if (!existing) return;
    const remainingQty = existing.quantity - qty;
    if (remainingQty <= 0) {
      this.holdings.splice(existingHoldingIndex, 1);
      return;
    }
    const currentVal = remainingQty * existing.ltp;
    const pnl = currentVal - remainingQty * existing.averagePrice;
    const pnlPercent = (pnl / (remainingQty * existing.averagePrice)) * 100;
    this.holdings[existingHoldingIndex] = {
      ...existing,
      quantity: remainingQty,
      currentValue: currentVal,
      pnl,
      pnlPercent,
    };
  }

  private applyToPositions(
    side: "BUY" | "SELL",
    symbol: string,
    qty: number,
    orderPrice: number,
  ): void {
    const existingIndex = this.positions.findIndex((p) => p.symbol === symbol);
    if (side === "BUY") {
      const existing = existingIndex >= 0 ? this.positions[existingIndex] : undefined;
      if (existing) {
        const newQty = existing.quantity + qty;
        const newAvg = (existing.quantity * existing.averagePrice + qty * orderPrice) / newQty;
        const ltp = existing.ltp || orderPrice;
        this.positions[existingIndex] = {
          ...existing,
          quantity: newQty,
          averagePrice: newAvg,
          pnl: newQty * ltp - newQty * newAvg,
        };
      } else {
        this.positions.push({
          symbol,
          quantity: qty,
          averagePrice: orderPrice,
          ltp: orderPrice,
          pnl: 0,
        });
      }
      return;
    }

    const existing = existingIndex >= 0 ? this.positions[existingIndex] : undefined;
    if (!existing) return;
    const remainingQty = existing.quantity - qty;
    if (remainingQty <= 0) {
      this.positions.splice(existingIndex, 1);
      return;
    }
    const ltp = existing.ltp || orderPrice;
    this.positions[existingIndex] = {
      ...existing,
      quantity: remainingQty,
      pnl: remainingQty * ltp - remainingQty * existing.averagePrice,
    };
  }
}

export function createInMemoryBroker(options?: InMemoryBrokerOptions): InMemoryBroker {
  return new InMemoryBroker(options);
}
