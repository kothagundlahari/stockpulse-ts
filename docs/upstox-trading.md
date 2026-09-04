# Upstox Trading

StockPulse connects to **Upstox** (the sole broker) via the Upstox Developer API for live holdings, positions, order history, and trade execution. Trading is deliberately guarded — you opt in, and it is your responsibility to review orders before they go live.

> **Warning:** Live trading involves real money. This is a research tool. Always review orders before confirming, and trade only what you can afford to lose.

## Prerequisites

1. Create an Upstox developer account at [upstox.com/developer](https://upstox.com/developer).
2. Create a new app to obtain your **API Key** and **API Secret**.
3. Set a **Redirect URI** (use `http://localhost:8787/callback` for local development).

## Environment variables

| Variable | Purpose |
|---|---|
| `UPSTOX_API_KEY` | OAuth app key from Upstox developer portal |
| `UPSTOX_API_SECRET` | OAuth app secret |
| `UPSTOX_REDIRECT_URI` | OAuth redirect URI (default: `http://localhost:8787/callback`) |

Set these in a `.env` file (gitignored) or export them in your shell. Never commit them.

## OAuth 2.0 authorization-code flow

StockPulse uses the standard OAuth 2.0 authorization-code flow implemented in `src/services/upstox.ts`.

### Step 1 — Get the auth URL

The server exposes the auth URL via `GET /api/broker`. The dashboard shows a "Connect to Upstox" button that opens this URL.

### Step 2 — Authorize in the browser

Open the auth URL, log in to Upstox, and approve access. You will be redirected to your redirect URI with an `code` query parameter.

### Step 3 — Exchange the code

Send the auth code to the dashboard:

```
POST /api/broker/auth
Content-Type: application/json

{ "code": "<AUTH_CODE>" }
```

The server exchanges the code for an access token and persists it in the local SQLite database (`broker_tokens` table). The token is then used for all subsequent API calls.

## Server endpoints

| Endpoint | Method | Description |
|---|---|---|
| `GET /api/broker` | GET | Returns Upstox auth status and the auth URL |
| `POST /api/broker/auth` | POST | Completes OAuth — accepts `{ code }`, stores the access token |
| `GET /api/portfolio` | GET | Holdings merged with live Yahoo quotes and per-holding recommendations |
| `GET /api/orders` | GET | Recent orders from Upstox (trade history) |
| `POST /api/trade` | POST | Place a real order (requires `confirm: true`) |

## Order parameters (`POST /api/trade`)

| Field | Type | Notes |
|---|---|---|
| `symbol` | string | Trading symbol (e.g. `RELIANCE`) |
| `side` | `BUY` or `SELL` | Order direction |
| `qty` | number | Number of shares (positive integer) |
| `type` | `LIMIT` or `MARKET` | Order type |
| `limitPrice` | number | Required for LIMIT orders |
| `confirm` | `true` | **Must be explicitly `true`** — server rejects the order otherwise |

The `confirm: true` requirement is a server-side safety backstop. The dashboard shows a confirmation modal ("This places a REAL order with your broker") before the request is sent.

## The `Broker` interface

The Upstox client implements the shared `Broker` interface (`src/services/broker-types.ts`), making it straightforward to add additional brokers in the future without changing the UI or API layer.

```ts
interface Broker {
  readonly name: string;
  isAuthenticated: boolean;
  getAuthUrl(): string;
  authenticate(code: string): Promise<void>;
  getHoldings(): Promise<Holding[]>;
  getPositions(): Promise<Position[]>;
  getOrders(): Promise<Order[]>;
  placeOrder(params: PlaceOrderParams & { confirm: true }): Promise<{ id: string }>;
}
```

## Token persistence

Access tokens are stored in the `broker_tokens` table of `./data/stockpulse.db` (SQLite). The database file is gitignored, so tokens never leave your local machine.

- Standard Upstox access tokens expire daily.
- The **Analytics Token** (available with a registered static IP) avoids daily re-auth for market data and read-only portfolio access.
- Tokens are never logged, printed, or committed.

## Security notes

- **Local only.** The server binds to all interfaces by default and has no auth. Do not expose port 8787 to the internet.
- **Never commit secrets.** Store API keys in environment variables or a `.env` file (gitignored).
- **Tokens in SQLite only.** The access token is written only to the local gitignored database — never to source code, logs, or version control.
- **Confirm before trading.** Every order requires an explicit `confirm: true` in the request body. The dashboard enforces this with a confirmation modal.
- Orders are submitted as-is. The server does not add slippage protection — use limit orders and review before confirming.
