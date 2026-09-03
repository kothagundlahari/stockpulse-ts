# Live Trading & FYERS

StockPulse can authenticate with **FYERS** and place orders. **Trading is deliberately guarded** — you opt in, and it's your responsibility to review orders before they go live.

> ⚠️ **Warning:** Live trading involves real money. This is a research tool. Verify all orders in the FYERS app, and trade only what you can afford to lose.

## Prerequisites

1. Create a FYERS developer account at developers.fyers.in
2. Create a new app to obtain your **App ID** and **Secret Key**
3. Set a **redirect URI** (it can be a dummy localhost URL for CLI auth, e.g. `http://localhost:8787`)

## Authentication flow

FYERS uses OAuth2 with the authorization-code flow. StockPulse implements it in `src/services/fyers.ts`.

### Step 1 — Print the auth URL

```bash
node dist/cli/index.js auth \
  --app-id <YOUR_APP_ID> \
  --secret <YOUR_SECRET> \
  --redirect "http://localhost:8787"
```

This prints a URL.

### Step 2 — Authorize in the browser

Open the printed URL, log in to FYERS, and approve. You'll be redirected to your redirect URI with an `auth_code` query parameter.

### Step 3 — Exchange the code

Pass the extracted code back to the CLI:

```bash
node dist/cli/index.js auth \
  --app-id <YOUR_APP_ID> \
  --secret <YOUR_SECRET> \
  --redirect "http://localhost:8787" \
  --code <AUTH_CODE>
```

The client exchanges the code for an **access token** and a **refresh token**, and confirms success.

## The `FyersClient` API

```ts
import { FyersClient } from "./src/services/fyers.js";

const client = new FyersClient({
  appId: "YOUR_APP_ID",
  secretKey: "YOUR_SECRET",
  redirectUri: "http://localhost:8787",
});

// OAuth
const url = client.getAuthUrl();          // open in browser
await client.authenticate(authCode);      // exchange code
await client.refreshAuthToken();          // refresh when expired

// Trading
const order = await client.placeOrder({
  symbol: "RELIANCE",
  qty: 10,
  side: "BUY",
  type: "LIMIT",
  limitPrice: 2500,
  productType: "INTRADAY",
});

// Data
const quote = await client.getQuote("RELIANCE");
```

| Method | Purpose | Auth required |
|---|---|---|
| `getAuthUrl()` | Build the OAuth authorize URL | No |
| `authenticate(code)` | Exchange auth code for tokens | No |
| `refreshAuthToken()` | Refresh expired access token | Yes (refresh token) |
| `getQuote(symbol)` | Live FYERS quote | Yes |
| `placeOrder(params)` | Submit an order | Yes |

## Order parameters

| Field | Type | Notes |
|---|---|---|
| `symbol` | string | e.g. `RELIANCE` (auto-prefixed with `NSE:`) |
| `qty` | number | Number of shares |
| `side` | `BUY` / `SELL` | Direction |
| `type` | `LIMIT` / `MARKET` / `SL` / `SL-M` | Order type |
| `limitPrice` | number | Required for limit orders |
| `productType` | `CNC` / `INTRADAY` / `MARGIN` | Default `INTRADAY` |

## Security notes

- **Never commit secrets.** Store your FYERS App ID and Secret in environment variables or a `.env` file (gitignored), and pass them at runtime.
- Tokens are held **in memory** in the current version. Persisting them securely (e.g. OS keychain or encrypted file) is a documented extension point.
- Orders are submitted as-is. The CLI does not add slippage protection — use limit orders and review before confirming.
