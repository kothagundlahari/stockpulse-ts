# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden StockPulse's localhost security posture — OAuth CSRF state, SSRF symbol restriction, security headers, localhost binding, request body caps, generic 500s, frontend XSS, and docs/hygiene — per the live CodeQL findings and the approved design.

**Architecture:** Defense-in-depth for a strictly-local single-user dashboard. Boundary checks live in `src/server.ts` (headers in the `wrap` wrapper, symbol allow-list on the affected routes, body cap in `readBody`, OAuth state on `/callback`); `src/services/upstox.ts` gains an optional `state` on the authorize URL; `public/app.js` escapes DOM sinks and converts inline `onclick=` handlers to delegation so the new strict CSP works.

**Tech Stack:** Node.js raw `http`, TypeScript (ESM, Node16 resolution), Zod, Vitest, Biome, vanilla JS frontend (`public/`).

**Spec:** `docs/superpowers/specs/2026-09-05-security-hardening-design.md`

## Global Constraints

- All relative imports use `.js` extensions (ESM + Node16). Strict TS, no `any`. Biome: double quotes, semicolons, 2-space indent, 100-col width. Preserve existing comments and docstrings.
- Run `pnpm check` (biome + `tsc --noEmit`) and `pnpm test` after every task; both must pass. Biome lints `src/` and `tests/` only — `public/` is unchecked, verify frontend manually.
- `pnpm build` must succeed before `start:server`; dev uses `pnpm dev:server`.
- Server default bind becomes `127.0.0.1`, overridable via `HOST`.
- CSP is `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` — strict `script-src` means **no inline `onclick=` may remain in `public/app.js`** (Task 6 is required for Task 3's CSP to work).
- Symbols are restricted to `^[A-Z0-9.\-]{1,20}$` at the server boundary (CodeQL `js/request-forgery` — alerts #1–#3).
- `/callback` never exchanges a code without a matching `state` cookie (CodeQL/RFC §4.1.2; spec §1, §7-derived gate).
- 5xx responses return `{ "error": "Internal server error" }`; real messages go to the server log only. Two 502 zod-validation responses (`/api/quote`, `/api/backtest`) keep their deterministic messages (spec ruling, see Plan Rulings).

## Plan Rulings (decisions resolving spec-vs-code conflicts, recorded for review)

1. **Callback state gate precedes error/no-code redirects.** The spec (§1) mandates 403 on missing/mismatched state. The existing `/callback` tests (error redirect, missing-code redirect, connectUpstox-failure) call the route without state; they are updated to send a valid cookie + `state` (or assert the new 403). Spec is binding authority.
2. **Existing 500 test updated.** `GET /api/personalities handles getFundamentals failure gracefully` asserts `/Data fetch error/`; per spec §5 it is updated to expect `"Internal server error"`.
3. **502 validation messages retained.** `/api/quote` and `/api/backtest` return `502` with a deterministic zod validation message. These are not internal-context leaks (schema details only) and function as user-facing upstream-data diagnostics, so they keep their text. All other 5xx paths become generic.
4. **`POST /api/broker/auth` stays un-gated.** It accepts a JSON `code` and is never invoked by `public/app.js` (the UI uses the `/callback` GET flow). Deferred minor; not in spec §1.
5. **SSRF task added from live CodeQL feed** (alerts #1–#3) after spec approval, per user guidance; spec §7 records it.

---

### Task 1: SSRF — restrict symbol input at the server boundary

**Files:**
- Modify: `src/server.ts` (add `assertValidSymbol`, apply in `/api/quote`, `/api/backtest`, `/api/news`, `/api/trade`)
- Test: `tests/server.test.ts`

**Interfaces:**
- Produces: `assertValidSymbol(symbol: string): boolean` in `src/server.ts` — matches `^[A-Z0-9.\-]{1,20}$`.
- Consumes: unchanged service signatures (`deps.yahoo.getQuote`, `deps.yahoo.getHistoricalPrices`, `fetchStockNews`, `deps.upstox.placeOrder`).

- [ ] **Step 1: Write the failing tests** — append to `tests/server.test.ts`. New describe block needs a stub yahoo so no real network is hit; the `vi` import already exists at line 3.

```ts
describe("SSRF symbol restriction", () => {
  it("rejects invalid symbols on /api/quote, /api/news, and /api/trade with 400", async () => {
    const getQuote = vi.fn();
    const customServer = await createServer({
      port: 0,
      realBroker: false,
      deps: {
        yahoo: {
          getQuote,
          getHistoricalPrices: async () => [],
          getFundamentals: vi.fn(),
        } as unknown as YahooFinanceService,
      },
    });
    await new Promise<void>((resolve) => customServer.listen(0, () => resolve()));
    const addr = customServer.address();
    const customBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 8787}`;

    try {
      const quoteBad = await fetch(
        `${customBase}/api/quote?symbol=${encodeURIComponent("../../../etc")}`,
      );
      expect(quoteBad.status).toBe(400);
      const quoteBadBody = await quoteBad.json();
      expect(quoteBadBody.error).toMatch(/symbol/i);
      expect(getQuote).not.toHaveBeenCalled();

      const newsBad = await fetch(
        `${customBase}/api/news?symbol=${encodeURIComponent("<script>")}`,
      );
      expect(newsBad.status).toBe(400);

      const tradeBad = await fetch(`${customBase}/api/trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: "../../etc",
          side: "BUY",
          qty: 1,
          type: "MARKET",
          confirm: true,
        }),
      });
      expect(tradeBad.status).toBe(400);
    } finally {
      customServer.close();
    }
  });

  it("accepts a valid uppercase symbol on /api/quote", async () => {
    const getQuote = vi.fn().mockResolvedValue({
      symbol: "RELIANCE",
      ltp: 2500,
      change: 5,
      changePercent: 0.2,
      open: 2480,
      high: 2510,
      low: 2470,
      previousClose: 2495,
      volume: 100000,
      timestamp: "2026-09-05T00:00:00.000Z",
    });
    const customServer = await createServer({
      port: 0,
      realBroker: false,
      deps: {
        yahoo: {
          getQuote,
          getHistoricalPrices: async () => [],
          getFundamentals: vi.fn(),
        } as unknown as YahooFinanceService,
      },
    });
    await new Promise<void>((resolve) => customServer.listen(0, () => resolve()));
    const addr = customServer.address();
    const customBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 8787}`;

    try {
      const res = await fetch(`${customBase}/api/quote?symbol=RELIANCE`);
      expect(res.status).toBe(200);
      expect(getQuote).toHaveBeenCalledWith("RELIANCE");
    } finally {
      customServer.close();
    }
  });
});
```

The double-encoded variant is intentionally removed and replaced with the single-encoded literal above so the server decodes it to `../../../etc`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/server.test.ts`
Expected: FAIL — the invalid-symbol requests return 200 (no validation), so `expect(quoteBad.status).toBe(400)` fails.

- [ ] **Step 3: Implement the guard**

In `src/server.ts`, after the `VALID_RANGES` block (line 41), add:

```ts
/** Allow-listed NSE ticker characters: blocks path/URL manipulation in outbound requests. */
export function assertValidSymbol(symbol: string): boolean {
  return /^[A-Z0-9.\-]{1,20}$/.test(symbol);
}
```

Then in the `/api/quote` route, right after the `if (!symbol)` check (line 413-414), add:

```ts
if (!assertValidSymbol(symbol)) {
  sendJson(res, 400, { error: "Invalid symbol" });
  return;
}
```

In `/api/backtest`, right after its `if (!symbol)` check (line 429-431):

```ts
if (!assertValidSymbol(symbol)) {
  sendJson(res, 400, { error: "Invalid symbol" });
  return;
}
```

In `/api/news`, right after its `if (!symbol)` check (line 457-459):

```ts
if (!assertValidSymbol(symbol)) {
  sendJson(res, 400, { error: "Invalid symbol" });
  return;
}
```

In `/api/trade`, right after the `if (typeof body.symbol !== "string" || body.symbol.trim() === "")` check (line 358), and note `body.symbol` is matched raw:

```ts
if (typeof body.symbol !== "string" || !assertValidSymbol(body.symbol.toUpperCase())) {
  sendJson(res, 400, { error: "Invalid symbol" });
  return;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test tests/server.test.ts`
Expected: PASS (both new tests; existing suite untouched).

- [ ] **Step 5: Full check and commit**

Run: `pnpm check && pnpm test`
Expected: PASS.

```bash
git add src/server.ts tests/server.test.ts
git commit -m "fix: restrict symbol input to prevent SSRF in outbound requests"
```

---

### Task 2: OAuth CSRF — `state` parameter

**Files:**
- Modify: `src/services/broker-types.ts:42`
- Modify: `src/services/upstox.ts:21-25`
- Modify: `src/server.ts` (`/api/broker` sets the state cookie; `/callback` validates it)
- Test: `tests/upstox.test.ts`, `tests/server.test.ts`

**Interfaces:**
- Produces: `getAuthUrl(state?: string): string` on the `Broker` interface and `UpstoxClient` — appends `&state=<urlencoded>` when provided. Server constants `OAUTH_STATE_COOKIE = "sp_oauth_state"`; helpers `readCookie(header, name): string | null`, `safeEqual(a, b): boolean` (constant-time). `/callback` now requires a matching cookie + `state` query; `/api/broker` returns `{ authenticated, authUrl, state }` and sets the cookie when unauthenticated.
- Consumes: unchanged `deps.upstox.getAuthUrl(...)` call sites; mock brokers already return strings and accept an ignored arg.

- [ ] **Step 1: Write failing tests**

Append to `tests/upstox.test.ts`:

```ts
it("getAuthUrl includes the state parameter when provided", () => {
  const url = client.getAuthUrl("abc123");
  expect(url).toContain("state=abc123");
});

it("getAuthUrl omits state when undefined", () => {
  expect(client.getAuthUrl()).not.toContain("state=");
});
```

Append to `tests/server.test.ts` a new describe block plus updates to the existing `/callback` tests. New tests first:

```ts
describe("OAuth callback state protection", () => {
  it("GET /api/broker sets a state cookie and includes state in the body when unauthenticated", async () => {
    const res = await fetch(`${base}/api/broker`);
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("sp_oauth_state=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    const body = (await res.json()) as { state?: string; authUrl: string };
    expect(typeof body.state).toBe("string");
    expect(body.authUrl).toContain(`state=${body.state}`);
  });

  it("GET /callback without a state returns 403 without exchanging a code", async () => {
    let connected = false;
    const customServer = await createServer({
      port: 0,
      realBroker: false,
      deps: {
        connectUpstox: async () => {
          connected = true;
          return getUnauthenticatedBroker();
        },
      },
    });
    await new Promise<void>((resolve) => customServer.listen(0, () => resolve()));
    const addr = customServer.address();
    const customBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 8787}`;

    try {
      const res = await fetch(`${customBase}/callback?code=attacker-code`, {
        redirect: "manual",
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toMatch(/state/i);
      expect(connected).toBe(false);
    } finally {
      customServer.close();
    }
  });

  it("GET /callback with a mismatched state returns 403 without exchanging a code", async () => {
    let connected = false;
    const customServer = await createServer({
      port: 0,
      realBroker: false,
      deps: {
        connectUpstox: async () => {
          connected = true;
          return getUnauthenticatedBroker();
        },
      },
    });
    await new Promise<void>((resolve) => customServer.listen(0, () => resolve()));
    const addr = customServer.address();
    const customBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 8787}`;

    try {
      const res = await fetch(`${customBase}/callback?code=attacker-code&state=wrong`, {
        redirect: "manual",
        headers: { cookie: "sp_oauth_state=expected" },
      });
      expect(res.status).toBe(403);
      expect(connected).toBe(false);
    } finally {
      customServer.close();
    }
  });

  it("GET /callback with matching state and cookie connects and redirects", async () => {
    let connectedCode = "";
    let authenticated = false;
    const customServer = await createServer({
      port: 0,
      realBroker: false,
      deps: {
        connectUpstox: async (code: string) => {
          connectedCode = code;
          authenticated = true;
          return getAuthenticatedBroker();
        },
      },
    });
    await new Promise<void>((resolve) => customServer.listen(0, () => resolve()));
    const addr = customServer.address();
    const customBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 8787}`;

    try {
      const res = await fetch(
        `${customBase}/callback?code=good-code&state=abc`,
        { redirect: "manual", headers: { cookie: "sp_oauth_state=abc" } },
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/?broker=connected");
      expect(connectedCode).toBe("good-code");
    } finally {
      customServer.close();
    }
  });
});
```

The helper brokers referenced above — add these module-level functions near the top of `tests/server.test.ts`, right after the `base` variable (line 10):

```ts
function getUnauthenticatedBroker(): Broker {
  return {
    name: "upstox",
    isAuthenticated: false,
    getAuthUrl: () => "https://api.upstox.com/v2/login/authorization/dialog",
    authenticate: () => Promise.resolve(),
    getHoldings: () => Promise.resolve([]),
    getPositions: () => Promise.resolve([]),
    getOrders: () => Promise.resolve([]),
    placeOrder: async () => ({ id: "mock-order" }),
  };
}

function getAuthenticatedBroker(): Broker {
  return {
    ...getUnauthenticatedBroker(),
    isAuthenticated: true,
  };
}
```

(`Broker` is already imported at line 5.)

Then **update** the four existing `/callback` tests (lines 402, 445, 455, 465) so every request supplies the state cookie and matching query param:

- Line 430: `fetch(\`${customBase}/callback?code=test-auth-code&state=test-state\`, { redirect: "manual", headers: { cookie: "sp_oauth_state=test-state" } })`
- Line 446: `fetch(\`${base}/callback?error=access_denied&state=test-state\`, { redirect: "manual", headers: { cookie: "sp_oauth_state=test-state" } })`
- Line 458: `fetch(\`${base}/callback?state=test-state\`, { redirect: "manual", headers: { cookie: "sp_oauth_state=test-state" } })`
- Line 480: `fetch(\`${customBase}/callback?code=bad-code&state=test-state\`, { redirect: "manual", headers: { cookie: "sp_oauth_state=test-state" } })`

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/upstox.test.ts tests/server.test.ts`
Expected: FAIL — `getAuthUrl` has no state; `/callback` with no state returns 302/200 instead of 403; `/api/broker` response has no `set-cookie`.

- [ ] **Step 3: Implement the state parameter**

`src/services/broker-types.ts:39-48`, change the interface method:

```ts
export interface Broker {
  readonly name: string;
  isAuthenticated: boolean;
  getAuthUrl(state?: string): string;
  ...
}
```

`src/services/upstox.ts:21-25`, replace `getAuthUrl`:

```ts
getAuthUrl(state?: string): string {
  const base = `https://api.upstox.com/v2/login/authorization/dialog?client_id=${encodeURIComponent(
    this.config.apiKey,
  )}&redirect_uri=${encodeURIComponent(this.config.redirectUri)}&response_type=code`;
  return state ? `${base}&state=${encodeURIComponent(state)}` : base;
}
```

`src/server.ts`:

1. Add `import { randomBytes, timingSafeEqual } from "node:crypto";` near the top imports.
2. Add near `const PORT` (line 43):

```ts
const OAUTH_STATE_COOKIE = "sp_oauth_state";
const HOST = process.env.HOST ?? "127.0.0.1";
```

(The `HOST` const is used by Task 3; acceptable here.)

3. Add helpers after `readBody` (line 77):

```ts
/** Read a single cookie value from a Cookie header. */
function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, value] = part.trim().split("=");
    if (key === name) return value ?? "";
  }
  return null;
}

/** Constant-time string comparison. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
```

4. Replace the `/api/broker` handler (lines 260-266):

```ts
if (pathname === "/api/broker") {
  if (deps.upstox.isAuthenticated) {
    sendJson(res, 200, { authenticated: true, authUrl: deps.upstox.getAuthUrl() });
    return;
  }
  const state = randomBytes(16).toString("hex");
  sendJson(
    res,
    200,
    { authenticated: false, authUrl: deps.upstox.getAuthUrl(state), state },
    { "Set-Cookie": `${OAUTH_STATE_COOKIE}=${state}; HttpOnly; SameSite=Lax; Path=/` },
  );
  return;
}
```

(This requires `sendJson` to accept an optional extra-headers argument — change its signature at line 56 to `export function sendJson(res, status, body, extraHeaders: Record<string, string> = {})` and merge into `writeHead`: `res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...extraHeaders })`.)

5. Replace the top of the `/callback` handler (lines 220-228, before the `error` check) — gate on state:

```ts
if (pathname === "/callback") {
  const clearStateCookie = () => {
    res.setHeader("Set-Cookie", `${OAUTH_STATE_COOKIE}=; Max-Age=0; Path=/`);
  };
  const cookieState = readCookie(req.headers.cookie, OAUTH_STATE_COOKIE);
  const queryState = searchParams.get("state");
  if (!cookieState || !queryState || !safeEqual(cookieState, queryState)) {
    clearStateCookie();
    sendJson(res, 403, { error: "OAuth state mismatch" });
    return;
  }

  const error = searchParams.get("error");
  if (error) {
    clearStateCookie();
    res.writeHead(302, {
      Location: `/?broker=error&message=${encodeURIComponent(error)}`,
    });
    res.end();
    return;
  }
```

And update the three remaining exit paths in the handler to call `clearStateCookie()` before their `writeHead(302, ...)` calls (missing code at line 231, success at line 247, failure at line 252).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/upstox.test.ts tests/server.test.ts`
Expected: PASS.

- [ ] **Step 5: Full check and commit**

Run: `pnpm check && pnpm test`
Expected: PASS (biome may flag the new constructor/type; fix with `pnpm lint -- --write` if needed).

```bash
git add src/services/broker-types.ts src/services/upstox.ts src/server.ts tests/upstox.test.ts tests/server.test.ts
git commit -m "fix: protect OAuth callback against account-linking CSRF with state parameter"
```

---

### Task 3: Localhost binding + security headers + static symlink hardening

**Files:**
- Modify: `src/server.ts`
- Test: `tests/server.test.ts`

**Interfaces:**
- Produces: `applySecurityHeaders(req, res)` (called inside `wrap`); `sendJson` gains `Cache-Control: no-store` and optional `extraHeaders`; `const REAL_PUBLIC_DIR` (realpath of `PUBLIC_DIR`); `const HOST` default `127.0.0.1` consumed by the main `listen`.
- Consumes: task introduces no interface changes for later tasks.

- [ ] **Step 1: Write failing tests** — append to `tests/server.test.ts`:

```ts
describe("HTTP security headers", () => {
  it("applies security headers on API responses", async () => {
    const res = await fetch(`${base}/api/broker`);
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(res.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("applies security headers on static assets", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("rejects path traversal with 403", async () => {
    const port = Number(new URL(base).port);
    const rawGet = (pathname: string): Promise<http.ServerResponse> =>
      new Promise((resolve, reject) => {
        const req = http.get({ host: "127.0.0.1", port, path: pathname }, (res) => resolve(res));
        req.on("error", reject);
      });
    const res = await rawGet("/../package.json");
    expect(res.statusCode).toBe(403);
    res.destroy();
  });
});
```

The `http` import already exists (`import type http from "node:http"` line 2) — the test file needs `import http from "node:http";` added since `http.get` is a runtime call. Change line 2 to `import http from "node:http";` (drop `type`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/server.test.ts`
Expected: FAIL — `content-security-policy`/`x-content-type-options`/etc. are `null`; `/../package.json` returns 200.

- [ ] **Step 3: Implement**

`src/server.ts`:

1. After `const PUBLIC_DIR` (line 27), add the real root:

```ts
const REAL_PUBLIC_DIR = path.resolve(fs.realpathSync(PUBLIC_DIR));
```

2. Add after `sendJson` (line 59):

```ts
const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};

/** Apply security headers to every response (HSTS only over real TLS). */
function applySecurityHeaders(req: http.IncomingMessage, res: http.ServerResponse): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
  if (req.socket.encrypted) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
  }
}
```

3. In `sendJson`, merge `extraHeaders` and add no-store:

```ts
export function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
) {
  res.setHeader("Cache-Control", "no-store");
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...extraHeaders });
  res.end(JSON.stringify(body));
}
```

4. In `wrap`, call `applySecurityHeaders` first (inside the returned handler, line 83-88):

```ts
return (req: http.IncomingMessage, res: http.ServerResponse) => {
  applySecurityHeaders(req, res);
  Promise.resolve(handler(req, res)).catch((err) => {
    sendJson(res, 500, { error: err instanceof Error ? err.message : "Unknown error" });
  });
};
```

(Task 5 replaces the 500 branch; the header call stays.)

5. Replace the static-file branch (lines 465-486) to realpath-check before reading:

```ts
const filePath = pathname === "/" ? "/index.html" : pathname;
const resolved = path.normalize(path.join(PUBLIC_DIR, filePath));
if (!resolved.startsWith(PUBLIC_DIR)) {
  res.writeHead(403);
  res.end("Forbidden");
  return;
}
let realResolved: string;
try {
  realResolved = fs.realpathSync(resolved);
} catch {
  res.writeHead(404);
  res.end("Not found");
  return;
}
if (!realResolved.startsWith(REAL_PUBLIC_DIR)) {
  res.writeHead(403);
  res.end("Forbidden");
  return;
}
fs.readFile(realResolved, (err, data) => {
  ...
});
```

6. In the main block (lines 566-583), bind the host:

```ts
const s = await createServer({ port: PORT, realBroker: true });
const isHttps = s instanceof https.Server;
s.listen(PORT, HOST, () => {
  ...
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/server.test.ts`
Expected: PASS. (The raw-path traversal test is deterministic: `/../package.json` normalizes outside `PUBLIC_DIR`, so the prefix check at `resolved.startsWith(PUBLIC_DIR)` rejects before realpath resolves anything.)

- [ ] **Step 5: Full check and commit**

Run: `pnpm check && pnpm test`
Expected: PASS.

```bash
git add src/server.ts tests/server.test.ts
git commit -m "feat: bind localhost by default, add security headers, harden static serving"
```

---

### Task 4: Request body cap

**Files:**
- Modify: `src/server.ts` (`readBody`, new `PayloadTooLargeError`, `wrap` 413 handling)
- Test: `tests/server.test.ts`

**Interfaces:**
- Produces: `const MAX_BODY_BYTES = 100 * 1024` (exported); `class PayloadTooLargeError extends Error`; `readBody(req)` throws it when `Content-Length` > cap or accumulated bytes > cap. `wrap` maps it to 413.
- Consumes: none from earlier tasks beyond existing `readBody` call sites.

- [ ] **Step 1: Write failing tests** — append to `tests/server.test.ts`:

```ts
describe("request body cap", () => {
  it("POST /api/trade with a body larger than 100KB returns 413", async () => {
    const big = { symbol: "A".repeat(100 * 1024), side: "BUY", qty: 1, type: "MARKET", confirm: true };
    const res = await fetch(`${base}/api/trade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(big),
    });
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toMatch(/large|exceeds/i);
  });

  it("POST /api/trade aborts an oversized chunked body with 413", async () => {
    const port = Number(new URL(base).port);
    const statusCode = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port, path: "/api/trade", method: "POST" },
        (res) => {
          expect(res.statusCode).toBe(413);
          res.resume();
          res.on("end", () => resolve(res.statusCode ?? 0));
        },
      );
      req.on("error", () => resolve(0));
      req.write(Buffer.alloc(120 * 1024, "a"));
      req.end();
    });
    expect(statusCode).toBe(413);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/server.test.ts`
Expected: FAIL — the 200KB request returns 400/200 (body fully read), not 413.

- [ ] **Step 3: Implement**

`src/server.ts`:

1. After `const PORT` / near `VALID_RANGES` (line 41), add:

```ts
export const MAX_BODY_BYTES = 100 * 1024;
```

2. After `ServerOptions`/before the wrap helper, add the error class (place before `readBody` usage — order is irrelevant for classes, so put it just above `readBody`):

```ts
/** Thrown by readBody when a request body exceeds MAX_BODY_BYTES. */
class PayloadTooLargeError extends Error {
  name = "PayloadTooLargeError";
}
```

3. Replace `readBody` (lines 62-77):

```ts
export async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new PayloadTooLargeError(`Request body exceeds ${MAX_BODY_BYTES} bytes`);
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer);
    size += buf.length;
    if (size > MAX_BODY_BYTES) {
      throw new PayloadTooLargeError(`Request body exceeds ${MAX_BODY_BYTES} bytes`);
    }
    chunks.push(buf);
  }
  if (chunks.length === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}
```

4. In `wrap` (inside the catch, line 84-86), map the error to 413 — the full catch becomes:

```ts
.catch((err) => {
  if (err instanceof PayloadTooLargeError) {
    sendJson(res, 413, { error: err.message });
    return;
  }
  sendJson(res, 500, { error: err instanceof Error ? err.message : "Unknown error" });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/server.test.ts`
Expected: PASS.

- [ ] **Step 5: Full check and commit**

Run: `pnpm check && pnpm test`
Expected: PASS.

```bash
git add src/server.ts tests/server.test.ts
git commit -m "feat: cap request body size at 100KB"
```

---

### Task 5: Generic 500 error responses

**Files:**
- Modify: `src/server.ts` (`wrap` 500 branch, `/api/personalities` inline catch, `handleBrokerError`)
- Test: `tests/server.test.ts`

**Interfaces:**
- Produces: all unhandled 5xx responses return `{ "error": "Internal server error" }`; real errors still logged via `console.error`. 4xx messages unchanged; the two `502` zod messages unchanged.
- Consumes: `PayloadTooLargeError` from Task 4 (its 413 branch stays functional).

- [ ] **Step 1: Write failing tests**

Append to `tests/server.test.ts`:

```ts
describe("generic server errors", () => {
  it("GET /api/personalities returns a generic 500 message on failure", async () => {
    const failingServer = await createServer({
      port: 0,
      realBroker: false,
      deps: {
        getFundamentals: async () => {
          throw new Error("Data fetch error");
        },
      },
    });
    await new Promise<void>((resolve) => failingServer.listen(0, () => resolve()));
    const addr = failingServer.address();
    const customBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 8787}`;

    try {
      const res = await fetch(`${customBase}/api/personalities`);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Internal server error");
      expect(Array.isArray(body.personalities)).toBe(true);
      expect(body.personalities).toHaveLength(0);
    } finally {
      failingServer.close();
    }
  });

  it("GET /api/portfolio returns a generic 500 on non-auth broker failure", async () => {
    const failingBroker: Broker = {
      name: "upstox",
      isAuthenticated: true,
      getAuthUrl: () => "",
      authenticate: async () => {},
      getHoldings: async () => {
        throw new Error("upstream exploded");
      },
      getPositions: async () => [],
      getOrders: async () => [],
      placeOrder: async () => ({ id: "mock-order" }),
    };
    const customServer = await createServer({
      port: 0,
      realBroker: false,
      deps: { upstox: failingBroker },
    });
    await new Promise<void>((resolve) => customServer.listen(0, () => resolve()));
    const addr = customServer.address();
    const customBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 8787}`;

    try {
      const res = await fetch(`${customBase}/api/portfolio`);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Internal server error");
      expect(body.expired).toBeUndefined();
    } finally {
      customServer.close();
    }
  });
});
```

Then **update** the existing `GET /api/personalities handles getFundamentals failure gracefully` test (lines 789-813) — change `expect(body.error).toMatch(/Data fetch error/);` to `expect(body.error).toBe("Internal server error");`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/server.test.ts`
Expected: FAIL — the two new/updated tests still see the real messages.

- [ ] **Step 3: Implement**

`src/server.ts`:

1. `wrap` catch (line 84-86) — replace the generic 500 to hide details and log:

```ts
.catch((err) => {
  if (err instanceof PayloadTooLargeError) {
    sendJson(res, 413, { error: err.message });
    return;
  }
  console.error("[server] Unhandled error:", err);
  sendJson(res, 500, { error: "Internal server error" });
});
```

2. `/api/personalities` inline catch (lines 145-152) — same treatment:

```ts
} catch (e) {
  console.error("[server] Failed to load personalities:", e);
  sendJson(res, 500, {
    error: "Internal server error",
    personalities: [],
    total: 0,
  });
}
```

3. `handleBrokerError` non-auth branch (line 119) — generic + log:

```ts
console.error("[server] Broker request failed:", e);
sendJson(res, 500, { error: "Internal server error" });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/server.test.ts`
Expected: PASS.

- [ ] **Step 5: Full check and commit**

Run: `pnpm check && pnpm test`
Expected: PASS.

```bash
git add src/server.ts tests/server.test.ts
git commit -m "fix: return generic 500 messages, log real errors server-side"
```

---

### Task 6: Frontend XSS hardening + inline-handler removal

**Files:**
- Modify: `public/app.js` (escape helper + every untrusted sink + inline `onclick=` → delegation)
- Modify: `tests/frontend-surfaces.test.ts` (static assertions)
- Manual verification (no `public/` test harness)

**Interfaces:**
- Produces: `escapeHtml(str)` in `public/app.js`; a single delegated `document.addEventListener("click", ...)` dispatching on `data-action` (`retry-personalities`, `dismiss-notice`, `authorize`); all formerly-inline handlers replaced so **no `onclick=` remains** (CSP requirement from Task 3).
- Consumes: no TS interfaces. Behavior must preserve: personality retry, notice dismissal, broker authorize/re-authorize buttons.

- [ ] **Step 1: Add the escape helper and delegation, remove all inline handlers, escape all sinks**

This is a transcription-heavy step; `public/` is not linted or unit-tested, so the diff itself is the deliverable. Make these exact edits in `public/app.js`:

1. After the `num` helper (line 8), add:

```js
const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"'`]/g, (ch) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
      "`": "&#96;",
    })[ch],
  );
```

2. Escape the error-text sinks and untrusted-data sinks (replace `${X}` with `${escapeHtml(X)}`):

| Line | Original interpolation | After |
|---|---|---|
| 54 | `${e.message}` | `${escapeHtml(e.message)}` |
| 153 | `${active.description}` | `${escapeHtml(active.description)}` |
| 198-199 | `data-symbol="${s.symbol}"` and `${s.symbol}` | `data-symbol="${escapeHtml(s.symbol)}"` and `${escapeHtml(s.symbol)}` |
| 206 | `${s.sector?.trim() || "Other"}` | `${escapeHtml(s.sector?.trim() || "Other")}` |
| 215 | `data-symbol="${s.symbol}"` | `data-symbol="${escapeHtml(s.symbol)}"` |
| 222 | `${personalityTableState.sectorFilter}` | `${escapeHtml(personalityTableState.sectorFilter)}` |
| 330 | `${p.name}` | `${escapeHtml(p.name)}` |
| 333 | `${p.description}` | `${escapeHtml(p.description)}` |
| 380 | `${e.message}` | `${escapeHtml(e.message)}` |
| 399 | `${symbol}` | `${escapeHtml(symbol)}` |
| 410 | `${e.message}` | `${escapeHtml(e.message)}` |
| 445 | `${n.title}`, `${n.source}` | `${escapeHtml(n.title)}`, `${escapeHtml(n.source)}` |
| 449 | `${e.message}` | `${escapeHtml(e.message)}` |
| 508 | `${e.message}` | `${escapeHtml(e.message)}` |
| 580 | `data-symbol="${h.symbol}"` and `${h.symbol}` | `data-symbol="${escapeHtml(h.symbol)}"` and `${escapeHtml(h.symbol)}` |
| 590 | `${reasons}` | `${escapeHtml(reasons)}` |
| 629 | `${e.message}` | `${escapeHtml(e.message)}` |
| 740 | `${o.symbol}`, `${o.side}`, `${o.status}` | `${escapeHtml(o.symbol)}`, `${escapeHtml(o.side)}`, `${escapeHtml(o.status)}` |
| 744 | `${e.message}` | `${escapeHtml(e.message)}` |

3. Also escape `n.pubDate` on line 445 (RSS-controlled).

4. Replace the five inline `onclick=` handlers (lines 380, 458, 505, 527, 727):

- Line 380 retry button: replace `` `<p class="error">${escapeHtml(e.message)}</p><button class="btn" style="margin-top:0.5rem;" onclick="loadPersonalities()">Retry</button>` `` with `` `<p class="error">${escapeHtml(e.message)}</p><button class="btn" style="margin-top:0.5rem;" data-action="retry-personalities">Retry</button>` ``
- Line 458 dismiss button: replace the `onclick` string with `data-action="dismiss-notice"`.
- Lines 505, 527, 727 authorize/re-authorize: replace `` `<span class="negative">○ Not connected</span> <button class="btn" onclick="window.open('${authUrl}', '_self')">Authorize</button>` `` (and the "Session expired" variants) with:

```js
`<span class="negative">○ Not connected</span> <button class="btn" data-action="authorize" data-auth-url="${escapeHtml(authUrl)}">Authorize</button>`
```

(For the 527/727 variant the label stays "Re-authorize".)

5. Add the delegated listener just before the `// Startup` section (line 764):

```js
document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "retry-personalities") {
    loadPersonalities();
  } else if (action === "dismiss-notice") {
    const banner = target.closest(".broker-banner");
    if (banner) banner.classList.add("hidden");
  } else if (action === "authorize") {
    window.open(target.dataset.authUrl, "_self");
  }
});
```

6. Also escape the `authUrl` interpolation that survives anywhere else (there are none after the above).

- [ ] **Step 2: Add static frontend assertions** — extend `tests/frontend-surfaces.test.ts`:

```ts
it("app.js contains no inline event handlers and uses the escape helper", () => {
  expect(appJs).not.toContain("onclick=");
  expect(appJs).toContain("escapeHtml");
});
```

- [ ] **Step 3: Run tests, then manual verification**

Run: `pnpm test tests/frontend-surfaces.test.ts`
Expected: FAIL before edits (onclick present), PASS after. If the suite picked up the earlier tasks, run `pnpm test` — must stay green. `pnpm check` — `public/` is excluded, so it must stay green too.

Manual verification against the running dashboard:

Run: `pnpm build && pnpm dev:server`
Open `http://localhost:8787` and verify:
- App loads with no console errors; the personality list renders.
- Personality detail renders correctly (name, description, table, sector filter, Buy buttons open the trade tab).
- On the quotes/news/backtest forms, submit an invalid symbol and confirm the error message renders as text (not HTML).
- Broker status shows either "Connected" or "Not connected"; click **Authorize** → navigates to Upstox (state param present in the URL). If tied to a real account, complete re-auth; if session-expired, confirm the **Re-authorize** path renders and navigates.
- Dismiss the broker notice with ✕ → banner hides.
- News list renders titles/sources as text.

- [ ] **Step 4: Commit**

```bash
git add public/app.js tests/frontend-surfaces.test.ts
git commit -m "fix: escape DOM sinks and replace inline handlers for CSP compliance"
```

---

### Task 7: Docs / hygiene / dependencies

**Files:**
- Create: `SECURITY.md` (replace), `.env.example`
- Modify: `package.json`, `docs/upstox-trading.md`, `docs/development.md`, `src/services/database.ts`
- Test: `tests/database.test.ts`

**Interfaces:**
- Produces: `DatabaseService` sets `0600` mode on the created DB file (best-effort, silent on failure). `.env.example` documents `UPSTOX_API_KEY`, `UPSTOX_API_SECRET`, `UPSTOX_REDIRECT_URI`, `PORT`, `HOST`, `OPEN_BROWSER`. `package.json` gains `"engines": { "node": ">=20" }` and `"audit": "pnpm audit --audit-level=high"`.
- Consumes: none from earlier tasks.

- [ ] **Step 1: Replace `SECURITY.md`** with:

```markdown
# Security Policy

StockPulse is a local-only research dashboard. It does not expose a public
service, but security issues should still be reported privately.

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.x     | ✅         |

## Reporting a Vulnerability

Please report security issues privately rather than opening a public issue:

- Open a GitHub issue on this repository with a **security** label, or
- Email the maintainer at `kothagundlahari@gmail.com` (address listed in
  the project README).

You can expect an initial response within one week. Confirmed issues are
fixed in the next normal release.

## Posture

- The server binds to `127.0.0.1` by default; it is not designed to be
  exposed to the internet (override the bind with `HOST=0.0.0.0` only on
  networks you trust).
- Upstox OAuth uses a `state` parameter to prevent account-linking CSRF.
- Secrets live only in a gitignored `.env` file and are never committed.
```

- [ ] **Step 2: Create `.env.example`** (root):

```bash
# Upstox OAuth credentials — create an app at https://upstox.com/developer
UPSTOX_API_KEY=
UPSTOX_API_SECRET=
# Must match the redirect URI registered for your Upstox app
UPSTOX_REDIRECT_URI=http://localhost:8787/callback

# Server
PORT=8787
# Bind address. 127.0.0.1 is the safe default; 0.0.0.0 exposes the dashboard to your LAN.
HOST=127.0.0.1

# Set to 1 to auto-open the browser when the dev server starts
OPEN_BROWSER=0
```

- [ ] **Step 3: Update `package.json`** — add `"engines": { "node": ">=20" }` (top level, after `"version"`), and add to `scripts`:

```json
"audit": "pnpm audit --audit-level=high"
```

- [ ] **Step 4: Update docs**

`docs/upstox-trading.md` — in the **Security notes** section, replace the "Local only." bullet with:

```markdown
- **Local only.** The server binds to `127.0.0.1` by default (override with `HOST`). It has no auth; do not expose port 8787 to the internet.
```

and add a bullet:

```markdown
- **OAuth state.** The authorization flow uses a random `state` parameter (validated on `/callback`) to prevent account-linking CSRF.
```

`docs/development.md` — in the **Environment variables** table, add:

```markdown
| `PORT` | Server port (default `8787`) |
| `HOST` | Bind address (default `127.0.0.1`) |
```

- [ ] **Step 5: Add DB file permissions** — edit `src/services/database.ts` constructor (lines 13-21) to chmod the file after open:

```ts
constructor(dbPath: string = "./data/stockpulse.db") {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  this.db = new SqliteDb(dbPath);
  try {
    fs.chmodSync(dbPath, 0o600);
  } catch {
    // Best-effort: some platforms do not expose chmod
  }
  this.db.pragma("journal_mode = WAL");
  this.migrate();
}
```

- [ ] **Step 6: Test the permission hardening** — append a new describe block to `tests/database.test.ts` (the file already imports `fs` at line 1 and uses the same suffix-cleanup pattern):

```ts
describe("database file permissions", () => {
  const DB_PATH = "./data/test-perms.db";

  const cleanup = () => {
    for (const suffix of ["", "-wal", "-shm"]) {
      const p = `${DB_PATH}${suffix}`;
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    }
  };

  beforeEach(cleanup);
  afterEach(cleanup);

  it("creates the database file with 0600 permissions", () => {
    const db = new DatabaseService(DB_PATH);
    db.close();
    const mode = fs.statSync(DB_PATH).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
```

- [ ] **Step 7: Run tests and commit**

Run: `pnpm test tests/database.test.ts && pnpm check && pnpm test`
Expected: PASS.

```bash
git add SECURITY.md .env.example package.json docs/upstox-trading.md docs/development.md src/services/database.ts tests/database.test.ts
git commit -m "chore: fill security policy, add .env.example, node engines, audit script, db perms"
```