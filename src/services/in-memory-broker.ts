import type { Broker, Holding, Order, PlaceOrderParams, Position } from "./broker-types.js";

const DEFAULT_MARK_PRICE = 100;

interface Lot {
  symbol: string;
  quantity: number;
  averagePrice: number;
  ltp: number;
  pnl: number;
}

function applyLotFill<T extends Lot>(
  lots: T[],
  side: "BUY" | "SELL",
  symbol: string,
  qty: number,
  orderPrice: number,
  adapters: {
    create: (lot: Lot) => T;
    update: (existing: T, lot: Lot) => T;
  },
): void {
  const index = lots.findIndex((item) => item.symbol === symbol);
  if (side === "BUY") {
    const existing = index >= 0 ? lots[index] : undefined;
    if (existing) {
      const quantity = existing.quantity + qty;
      const averagePrice =
        (existing.quantity * existing.averagePrice + qty * orderPrice) / quantity;
      const ltp = existing.ltp || orderPrice;
      const pnl = quantity * ltp - quantity * averagePrice;
      lots[index] = adapters.update(existing, { symbol, quantity, averagePrice, ltp, pnl });
    } else {
      lots.push(
        adapters.create({
          symbol,
          quantity: qty,
          averagePrice: orderPrice,
          ltp: orderPrice,
          pnl: 0,
        }),
      );
    }
    return;
  }

  const existing = index >= 0 ? lots[index] : undefined;
  if (!existing) return;
  const quantity = existing.quantity - qty;
  if (quantity <= 0) {
    lots.splice(index, 1);
    return;
  }
  const ltp = existing.ltp || orderPrice;
  const pnl = quantity * ltp - quantity * existing.averagePrice;
  lots[index] = adapters.update(existing, {
    symbol,
    quantity,
    averagePrice: existing.averagePrice,
    ltp,
    pnl,
  });
}

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
      throw new Error("Order not confirmed. Pass confirm:true to place a real order.");
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
        : (this.holdings.find((h) => h.symbol === params.symbol)?.ltp ??
          this.positions.find((p) => p.symbol === params.symbol)?.ltp ??
          DEFAULT_MARK_PRICE);

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
    applyLotFill(this.holdings, params.side, params.symbol, params.qty, orderPrice, {
      create: (lot) => ({
        symbol: lot.symbol,
        quantity: lot.quantity,
        averagePrice: lot.averagePrice,
        ltp: lot.ltp,
        pnl: lot.pnl,
        pnlPercent: 0,
        dayChange: 0,
        dayChangePercent: 0,
        currentValue: lot.quantity * lot.ltp,
      }),
      update: (existing, lot) => {
        const currentValue = lot.quantity * existing.ltp;
        return {
          ...existing,
          quantity: lot.quantity,
          averagePrice: lot.averagePrice,
          currentValue,
          pnl: lot.pnl,
          pnlPercent:
            lot.quantity * lot.averagePrice === 0
              ? 0
              : (lot.pnl / (lot.quantity * lot.averagePrice)) * 100,
        };
      },
    });
    applyLotFill(this.positions, params.side, params.symbol, params.qty, orderPrice, {
      create: (lot) => lot,
      update: (existing, lot) => ({
        ...existing,
        quantity: lot.quantity,
        averagePrice: lot.averagePrice,
        pnl: lot.pnl,
      }),
    });

    return { id: orderId };
  }
}

export function createInMemoryBroker(options?: InMemoryBrokerOptions): InMemoryBroker {
  return new InMemoryBroker(options);
}
