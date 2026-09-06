# Upstox Trading

StockPulse connects to **Upstox** as the live Broker adapter via the Upstox Developer API for Holdings, Positions, Order history, and Order placement. Placement is deliberately gated — you opt in, and it is your responsibility to review an Order request before it goes live.

> **Warning:** Live trading involves real money. This is a research tool. Always review orders before confirming, and trade only what you can afford to lose.

## Prerequisites

1. Create an Upstox developer account at [upstox.com/developer](https://upstox.com/developer).
2. Create a new app to obtain your **API Key** and **API Secret**.
3. Set a **Redirect URI** (use `https://localhost:8787/callback` for local development; it must match the dashboard scheme).

## Environment variables

| Variable | Purpose |
|---|---|
| `UPSTOX_API_KEY` | OAuth app key from Upstox developer portal |
| `UPSTOX_API_SECRET` | OAuth app secret |
| `UPSTOX_REDIRECT_URI` | OAuth redirect URI (default: `https://localhost:8787/callback`) |
| `OAUTH_STATE_KEY` | Optional HMAC key for the Broker-connect CSRF cookie (raw OAuth `state` is never stored in the cookie) |

Set these in a `.env` file (gitignored) or export them in your shell. Never commit them.

## OAuth 2.0 authorization-code flow

StockPulse uses the standard OAuth 2.0 authorization-code flow implemented in `src/services/upstox.ts` and automated via the server's `/callback` handler.

### Step 1 — Click "Authorize" in the dashboard

The server exposes the auth URL via `GET /api/broker`. When unauthenticated, that response also sets an HttpOnly `SameSite=Lax` cookie whose value is an HMAC of a CSRF nonce (not the nonce itself). The JSON body still includes the nonce so it can be appended to the authorize URL as OAuth `state`. The dashboard shows a "Connect to Upstox" button (or "Re-authorize" if disconnected) that directs the user to Upstox's login page.

### Step 2 — Log in and approve on Upstox

Log in to your Upstox account and approve access permissions for the application.

### Step 3 — Automatic redirect & token exchange

Upstox automatically redirects back to `https://localhost:8787/callback?code=...&state=...`. The server compares the query `state` to the HMAC in the cookie (constant-time). A missing or mismatched cookie returns **403** and does not exchange the code. On every outcome (mismatch, provider error, missing code, success, token-exchange failure) the cookie is expired (`Max-Age=0`). A matching cookie exchanges the authorization code for an access token, persists it in the local SQLite database (`broker_tokens` table), and redirects the browser to `/?broker=connected`. Manual code pasting is no longer required. (The manual endpoint `POST /api/broker/auth` remains available if needed.)

## Server endpoints

| Endpoint | Method | Description |
|---|---|---|
| `GET /callback` | GET | OAuth 2.0 redirect handler (CSRF cookie + `state` gate, then code exchange; expires the cookie) |
| `GET /api/broker` | GET | Returns Upstox auth status and the auth URL |
| `POST /api/broker/auth` | POST | Completes OAuth manually — accepts `{ code }`, stores the access token |
| `POST /api/broker/disconnect` | POST | Clears stored broker token and resets session |
| `GET /api/portfolio` | GET | Holdings merged with live Yahoo quotes and per-holding recommendations |
| `GET /api/orders` | GET | Recent Orders from the live Broker |
| `POST /api/trade` | POST | Place an Order (requires `confirm: true`) |

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
  getAuthUrl(state?: string): string;
  authenticate(code: string): Promise<void>;
  getHoldings(): Promise<Holding[]>;
  getPositions(): Promise<Position[]>;
  getOrders(): Promise<Order[]>;
  placeOrder(params: OrderRequest): Promise<{ id: string }>;
}
```

`getBroker()` returns the active adapter. Tests and offline work use `InMemoryBroker`, which enforces the same `confirm: true` gate (ADR-0001). Confirmed Orders are delivery fills: they update Holdings, not Positions (ADR-0003).

## Token persistence

Access tokens are stored in the `broker_tokens` table of `./data/stockpulse.db` (SQLite). The database file is gitignored, so tokens never leave your local machine.

- Standard Upstox access tokens expire daily.
- The **Analytics Token** (available with a registered static IP) avoids daily re-auth for market data and read-only portfolio access.
- Tokens are never logged, printed, or committed.

## Token Expiry & Session Management

- **Daily Token Expiration:** Standard Upstox access tokens expire daily (typically at 3:30 AM IST).
- **Automated Session Cleanup on 401:** When a token expires or is invalidated, upstream Upstox API requests return HTTP `401 Unauthorized`. StockPulse automatically catches 401 errors from broker calls, deletes the stored token from SQLite (`broker_tokens`), resets the in-memory broker instance, and returns a 401 status to the dashboard.
- **UI Re-authorization:** When the dashboard receives a 401 from any broker endpoint (or during initial status polling), it marks the connection as disconnected and prompts the user with a "Re-authorize" button to re-authenticate with one click.
- **Manual Disconnect:** Users can also click "Disconnect" in the UI at any time (or call `POST /api/broker/disconnect`) to clear stored credentials and reset the session.

## Security notes

- **Local only.** The server binds to `127.0.0.1` by default (override with `HOST`). It has no auth; do not expose port 8787 to the internet.
- **OAuth state.** The authorization flow uses a random `state` parameter (validated on `/callback`) to prevent account-linking CSRF.
- **Never commit secrets.** Store API keys in environment variables or a `.env` file (gitignored).
- **Tokens in SQLite only.** The access token is written only to the local gitignored database — never to source code, logs, or version control.
- **Confirm before an Order.** Every Order request requires an explicit `confirm: true` in the request body. The dashboard enforces this with a confirmation modal.
- Orders are submitted as-is. The server does not add slippage protection — use limit orders and review before confirming.
