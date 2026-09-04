# Upstox Automated OAuth Callback & Session Management Design

**Date:** 2026-09-04  
**Status:** Approved  
**Topic:** Upstox OAuth 2.0 callback automation, session expiry handling, and disconnect capability

---

## 1. Overview & Problem Statement

StockPulse integrates with Upstox for live portfolio holdings and trade execution. The core client (`src/services/upstox.ts`), server routes (`src/server.ts`), and UI exist and have unit test coverage.

However, three key usability and reliability issues currently break the user experience:
1. **Broken Callback Redirection**: Clicking "Authorize" in the UI opens Upstox's login screen. Upon approval, Upstox redirects to `http://localhost:8787/callback?code=<AUTH_CODE>`. Because `src/server.ts` has no `/callback` handler, the browser receives a `404 Not Found`. Users are expected to manually extract the code and make an external HTTP POST request to `/api/broker/auth`.
2. **Unhandled Token Expiry (Daily 401s)**: Upstox access tokens expire daily (~3:30 AM IST). Once expired, API calls fail with HTTP 401 upstream, triggering unhandled 500 errors in StockPulse. The server does not detect expiration or clear the stale token, locking the user in a broken state.
3. **Missing Disconnect / Re-auth Control**: When connected, there is no way for the user to disconnect or force re-authentication from the dashboard.

---

## 2. Proposed Architecture & Workflow

### 2.1 Automated OAuth Callback (`GET /callback`)
- Add a `GET /callback` handler in `src/server.ts`.
- Extract `code` and `error` from query parameters.
- If `error` is present (e.g. user denied): redirect with HTTP 302 to `/?broker=error&message=<error>`.
- If `code` is present:
  - Exchange the code using `deps.connectUpstox(code)`.
  - Update `deps.upstox` with the newly authenticated client.
  - Redirect with HTTP 302 to `/?broker=connected`.
- If neither is present: redirect with HTTP 302 to `/?broker=error&message=Missing+code`.

### 2.2 Token Disconnection & Deletion
- In `DatabaseService` (`src/services/database.ts`):
  - Add `deleteBrokerToken(broker: string): void`: executes `DELETE FROM broker_tokens WHERE broker = ?`.
- In `src/services/broker.ts`:
  - Add `disconnectUpstox(): void`: deletes `"upstox"` from SQLite and resets the cached client to `createUpstoxClient(undefined)`.
- In `src/server.ts`:
  - Add `POST /api/broker/disconnect`: calls `disconnectUpstox()`, reassigns `deps.upstox = getUpstoxClient()`, and returns `{ ok: true }`.

### 2.3 Upstream 401 Token Expiry Handling
- In `src/server.ts`, wrap `deps.upstox` calls in `/api/portfolio`, `/api/orders`, and `/api/trade`:
  - Detect HTTP 401 from Axios (via `isAxiosError(e) && e.response?.status === 401` or error status inspection).
  - Automatically call `disconnectUpstox()` and reset `deps.upstox` to unauthenticated.
  - Respond with HTTP 401: `{ error: "Upstox session expired. Please re-authorize.", expired: true }`.

### 2.4 Frontend Dashboard Updates (`public/app.js`, `public/index.html`, `public/style.css`)
- **Query Parameter Handling on Load**:
  - Check `URLSearchParams` for `broker=connected` or `broker=error`.
  - If `connected`, display an alert banner: `"Successfully connected to Upstox!"`.
  - If `error`, display an error banner: `"Upstox authorization failed: <message>"`.
  - Clean URL parameters with `window.history.replaceState({}, document.title, window.location.pathname)`.
- **Broker Status UI**:
  - If authenticated: render `● Connected to Upstox` alongside a `Disconnect` button.
  - Clicking `Disconnect` issues `POST /api/broker/disconnect`, refreshes status, and resets portfolio/order views.
  - If session expired (HTTP 401 response from `/api/portfolio` or `/api/orders`):
    - Update broker status to `○ Session expired`.
    - Provide an immediate `Re-authorize` button opening `authUrl`.

---

## 3. Security & Design Constraints
- All imports adhere to Node16 ESM (`.js` extension required).
- No secrets committed; tokens remain local in SQLite (`./data/stockpulse.db`).
- Preserve existing unit test coverage and add dedicated test coverage for the callback route, disconnect endpoint, and 401 expiration handling.
