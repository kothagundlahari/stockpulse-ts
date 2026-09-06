# Security Hardening — Design

- **Date:** 2026-09-05
- **Scope:** Local-first hardening of StockPulse (Approach A)
- **Threat model:** Strictly local, single-user dashboard on the user's machine. Hardening is defense-in-depth against poisoned upstream data (Yahoo Finance), malicious web pages (OAuth CSRF/account-linking, clickjacking), LAN neighbors reachable via the all-interface bind, and supply-chain/hygiene debt. Not a boundary for internet exposure — the server remains local-only.

## Out of Scope

Per the "Local-first" scope decision, these are explicitly excluded:

- At-rest token encryption (an attacker who can read `data/stockpulse.db` can read process memory; encryption adds no boundary)
- Request rate limiting (single local user, no abuse model)
- Exact dependency version pins (`^` ranges + lockfile already pin installs)
- Refactoring all 30 `innerHTML` sinks (only the untrusted-data ones are hardened)

## 1. OAuth CSRF — `state` parameter

**Files:** `src/services/upstox.ts`, `src/server.ts`

Current `src/services/upstox.ts:21-24` builds the authorize URL without `state`, and `/callback` (`src/server.ts:220-258`) exchanges any `code` it is handed. An attacker page can craft `http://localhost:8787/callback?code=<attacker-code>` and link the attacker's Upstox account to the server.

- `UpstoxClient.authorizeUrl()` generates `crypto.randomBytes(32).toString("hex")` as the state and includes it as the `state` query parameter in the authorize URL. The state is returned to the caller alongside the URL.
- The `/api/broker` handler (`src/server.ts:260`) — when the broker is not connected — sets the state as a cookie: `sp_oauth_state=<state>; HttpOnly; SameSite=Lax; Path=/`, via the shared `setSecurityHeaders`/response-helper layer, and includes the state in the JSON response for the frontend.
- The `/callback` handler reads `state` from the query string and the `sp_oauth_state` cookie. If the cookie is absent or the values do not match (constant-time compare), respond **403** with `{ error: "OAuth state mismatch" }` and perform **no** token exchange.
- On success or failure the cookie is cleared (`Set-Cookie: sp_oauth_state=; Max-Age=0; Path=/`).
- No server-side memory, so the flow survives server restarts. The authorize URL is only served while disconnected, so the state is not rotated mid-flow.
- The cookie is used only as CSRF state transport; the server remains cookie-free for all other purposes and still uses no session auth.

## 2. Localhost binding + security headers

**Files:** `src/server.ts`

### Bind

- New env var `HOST`, default `127.0.0.1`. Passed to `server.listen(port, host, cb)` for both HTTP and the optional HTTPS server.
- Users wanting LAN reach set `HOST=0.0.0.0` explicitly.

### Headers

A single `setSecurityHeaders(req, res)` applied to **every** response via `sendJson`, the static-file handler, and the error path:

- `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Strict-Transport-Security: max-age=31536000` **only when serving over HTTPS** (not over plain HTTP)
- `Cache-Control: no-store` on all `/api/*` responses

CSP is strict on scripts (`script-src 'self'`) so the inline `onclick=` handlers removed in section 3 are required for the app to keep working. `style-src 'unsafe-inline'` covers the existing inline `style=` attributes in `index.html` and rendered markup.

### Static file traversal

Keep the existing `path.normalize` + prefix check and add a symlink-escape check: resolve the candidate path with `fs.realpathSync` and reject with 403 if the real path lies outside the real `public/` directory. Guard against `realpathSync` throwing on a missing file (fall through to the existing 404 handling).

### HTTPS

No new certificate story. HSTS is emitted only when the existing optional local-cert HTTPS path is active.

## 3. Frontend XSS + inline-handler removal

**File:** `public/app.js`

- Add an `escapeHtml(str)` helper that escapes `&`, `<`, `>`, `"`, `'`, and backtick before interpolation into any `innerHTML` template.
- Apply `escapeHtml` to every interpolation of untrusted data in `innerHTML` templates, specifically:
  - Every `e.message` error string rendered into a `.error`/`#error` element
  - Backtest: the user-supplied `symbol`
  - Order history: `o.symbol`, `o.side`, `o.quantity`, `o.price`, status/text fields
  - Persona detail: `p.name`, `p.description`, `p.symbol`, `p.sector`, `active.description`
  - Holding-recommendation `reasons` text
  - The broker auth URL interpolated into `data-auth-url` attributes
- Replace inline `onclick=` handlers generated in `innerHTML` (currently lines 380, 458, 505, 527, 727) with `data-action` attributes driven by a single delegated `click` listener bound once on `document`. This is required for compatibility with `script-src 'self'` and removes the `authUrl` interpolation from an executable context.
- `public/` is excluded from Biome and Vitest (`biome.json:9`); verification is manual against the running dashboard: app loads, personality section renders, broker authorize + session-expired paths work, trade form works, no errors in the console.

## 4. Request body cap

**File:** `src/server.ts` `readBody`

- Before reading: if `Content-Type` is JSON and `Content-Length` > `MAX_BODY_BYTES` (= 100 KB), respond 413 `{ error: "Payload too large" }`.
- While streaming: if accumulated size exceeds `MAX_BODY_BYTES`, abort the read and respond 413.
- API routes that take bodies today: `/api/trade`, `/api/broker/auth`.

## 5. Error disclosure

**File:** `src/server.ts` `wrap()`

- For 5xx responses, respond `{ error: "Internal server error" }` — the real `err.message` is written to the server log only.
- 4xx error messages are unchanged (they are deterministic and non-sensitive).

## 6. Docs / hygiene / dependencies

- **`SECURITY.md`** — replace the GitHub template with real content: supported version `1.0.x`, vulnerability reporting path (private message via the repo's GitHub Issues with a security label, or maintainer email), and a note that this is a localhost-only tool.
- **`.env.example`** — new file documenting `UPSTOX_API_KEY`, `UPSTOX_API_SECRET`, `UPSTOX_REDIRECT_URI`, `PORT`, `HOST`, `OPEN_BROWSER` with one-line comments. Never include real values.
- **`package.json`** — add `"engines": { "node": ">=20" }`; add script `"audit": "pnpm audit --audit-level=high"` (standalone; **not** wired into `check` per decision).
- **`docs/upstox-trading.md`, `docs/development.md`** — update the bind default to `127.0.0.1`, document the `HOST` override, note the new OAuth state protection.
- **`src/services/database.ts`** — after creating the DB file, `chmod` the file to `0600` (POSIX only; skip silently on platforms where `chmodSync` is unavailable).

## 7. Server-side request forgery — symbol input restriction

**Files:** `src/server.ts`

Added after spec approval from the live CodeQL feed (alerts #1–#3, `js/request-forgery`, critical): the user-supplied `?symbol=` parameter flows unvalidated into outbound request URLs in `src/services/yahoo-finance.ts:29` (`getQuote`) and `src/services/yahoo-finance.ts:66` (`getHistoricalPrices`). A crafted value (`../`, URL metacharacters) could redirect requests to unintended endpoints.

- Add `assertValidSymbol(symbol: string)` in `src/server.ts`: returns `true` when the symbol matches `^[A-Z0-9.\-]{1,20}$` (uppercase NSE-style tickers; letters, digits, `.`, `-`), else `false`.
- Apply at the boundary in `/api/quote` (`src/server.ts:410`), `/api/backtest` (`src/server.ts:426`), each returning **400** `{ error: "Invalid symbol" }` on failure. Symbol inputs are uppercased before validation exactly as today.
- Apply the same check to the `body.symbol` in `/api/trade` (`src/server.ts:358`).
- This restricts user input to the allow-listed character class per the CodeQL `js/request-forgery` recommendation, making path/URL manipulation impossible.
- Tests: `tests/server.test.ts` — `/api/quote?symbol=..%2F..%2Fetc` → 400; `/api/quote?symbol=VALID` → 200; `/api/trade` with symbol `../../../etc` → 400.

## Testing Strategy

Extend existing suites; run `pnpm check && pnpm test` before completion.

- `tests/server.test.ts`:
  - Security headers present on a sample `/api` route and on a static asset
  - Oversized `Content-Length` → 413; streaming over-cap → 413
  - Throwing route → generic 500 message (real message not leaked); personality-failure path updated to the generic message
  - `/callback` with missing/mismatched state → 403, no exchange
  - `/callback` with matching cookie + state → proceeds; existing callback tests updated to send a valid state
  - Static traversal `..` → 403
  - Invalid symbols → 400 on `/api/quote`, `/api/trade`; valid symbol passes
- `tests/upstox.test.ts`: authorize URL contains a `state` query parameter, and omits it when none is given.
- `tests/broker.test.ts`: unaffected behavior (token save/load) still passes.
- `tests/database.test.ts`: DB still opens; a `0600` mode assertion on the created file (POSIX; skipped gracefully elsewhere).
- Frontend: manual verification only (see section 3); `tests/frontend-surfaces.test.ts` additionally asserts `app.js` has no `onclick=` and contains the `escapeHtml` helper.

## Constraints

- Per `AGENTS.md`: ESM + Node16 resolution — all relative imports use `.js` extensions; strict TS without `any`; Biome double-quotes/semicolons/2-space/100-col; preserve existing comments and docstrings. Run `pnpm check` after changes.