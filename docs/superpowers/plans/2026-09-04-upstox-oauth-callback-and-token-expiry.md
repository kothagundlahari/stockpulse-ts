# Upstox Automated OAuth Callback & Session Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate the Upstox OAuth callback redirect flow, handle upstream 401 token expiration gracefully, and provide disconnect/re-authorization capabilities in the dashboard.

**Architecture:** Add `deleteBrokerToken` to `DatabaseService` and `disconnectUpstox` to the broker service. Add `GET /callback` and `POST /api/broker/disconnect` routes to the raw HTTP server (`src/server.ts`), and intercept upstream 401 errors from Upstox to clear stale tokens. Update `public/app.js` and `public/index.html` to consume query redirect parameters (`?broker=connected`), render a Disconnect button when authorized, and display session expiration warnings with a one-click re-authorization prompt.

**Tech Stack:** TypeScript (ESM, Node16, `.js` import extensions), Node.js `http`, better-sqlite3, axios, vitest, vanilla JS/CSS.

**Spec:** `docs/superpowers/specs/2026-09-04-upstox-oauth-callback-and-token-expiry-design.md`

## Global Constraints

- ESM with Node16 resolution — **all relative imports must use `.js` extensions** even when importing `.ts` files.
- Use `pnpm` only. Verify with `pnpm check` (biome + `tsc --noEmit`) and `pnpm test` (vitest) after each task.
- Strict TS, no `any` (use `unknown` + narrowing).
- Biome preset `recommended`: double quotes, semicolons, 2-space indent, 100-col width.
- Auth/secrets via `process.env` from a gitignored `.env`; never commit them.
- Local SQLite database lives at `data/stockpulse.db` (gitignored). Tests use isolated temporary databases or mocks.

---

### Task 1: Database and broker disconnect support

**Files:**
- Modify: `src/services/database.ts:75-95`
- Modify: `src/services/broker.ts:1-25`
- Test: `tests/database.test.ts`
- Test: `tests/broker.test.ts`

**Interfaces:**
- Consumes: `better-sqlite3` statement execution.
- Produces:
  - `DatabaseService.prototype.deleteBrokerToken(broker: string): void`
  - `disconnectUpstox(): void`

- [ ] **Step 1: Write the failing tests**

In `tests/database.test.ts`, add a test verifying `deleteBrokerToken`:
```ts
it("deletes a stored broker token", () => {
  const db = new DatabaseService(tempDbPath);
  db.setBrokerToken("upstox", "tok-xyz");
  expect(db.getBrokerToken("upstox")).toBe("tok-xyz");

  db.deleteBrokerToken("upstox");
  expect(db.getBrokerToken("upstox")).toBeNull();
  db.close();
});
```

In `tests/broker.test.ts`, add a test verifying `disconnectUpstox`:
```ts
it("disconnectUpstox clears the stored token and resets the client", () => {
  disconnectUpstox();
  expect(mockDeleteToken).toHaveBeenCalledWith("upstox");
  const client = getUpstoxClient();
  expect(client.isAuthenticated).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/database.test.ts tests/broker.test.ts`  
Expected: FAIL with `db.deleteBrokerToken is not a function` or `disconnectUpstox is not defined`.

- [ ] **Step 3: Implement `deleteBrokerToken` and `disconnectUpstox`**

In `src/services/database.ts`:
```ts
deleteBrokerToken(broker: string): void {
  this.db.prepare("DELETE FROM broker_tokens WHERE broker = ?").run(broker);
}
```

In `src/services/broker.ts`:
```ts
import { DatabaseService } from "./database.js";
import { createUpstoxClient, type UpstoxClient } from "./upstox.js";

let client: UpstoxClient | null = null;

export function getUpstoxClient(): UpstoxClient {
  if (client) return client;
  const db = new DatabaseService();
  const token = db.getBrokerToken("upstox");
  db.close();
  client = createUpstoxClient(token ?? undefined);
  return client;
}

export async function connectUpstox(authCode: string): Promise<void> {
  const fresh = createUpstoxClient();
  await fresh.authenticate(authCode);
  const token = fresh.getAccessToken();
  const db = new DatabaseService();
  db.setBrokerToken("upstox", token);
  db.close();
  client = fresh;
}

export function disconnectUpstox(): void {
  const db = new DatabaseService();
  db.deleteBrokerToken("upstox");
  db.close();
  client = createUpstoxClient(undefined);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/database.test.ts tests/broker.test.ts`  
Expected: PASS (all tests in both files pass).

- [ ] **Step 5: Run linter and typecheck**

Run: `pnpm check`  
Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/services/database.ts src/services/broker.ts tests/database.test.ts tests/broker.test.ts
git commit -m "feat(broker): add deleteBrokerToken and disconnectUpstox methods"
```

---

### Task 2: Server OAuth callback route and disconnect endpoint

**Files:**
- Modify: `src/server.ts:40-60` (ServerDeps)
- Modify: `src/server.ts:180-210` (router routes)
- Modify: `src/server.ts:410-460` (createServer deps)
- Test: `tests/server.test.ts`

**Interfaces:**
- Consumes: `deps.connectUpstox`, `deps.disconnectUpstox`.
- Produces:
  - `GET /callback`: Handles OAuth redirect from Upstox, redirects to `/?broker=connected` or `/?broker=error&message=...`.
  - `POST /api/broker/disconnect`: Clears broker session and returns `{ ok: true }`.

- [ ] **Step 1: Write failing tests in `tests/server.test.ts`**

Add tests for `/callback` and `POST /api/broker/disconnect`:
```ts
it("GET /callback with code connects upstox and redirects to /?broker=connected", async () => {
  let connectedCode = "";
  const testServer = await createServer({
    port: 0,
    deps: {
      connectUpstox: async (code: string) => {
        connectedCode = code;
        return {
          name: "upstox",
          isAuthenticated: true,
          getAuthUrl: () => "",
          authenticate: async () => {},
          getHoldings: async () => [],
          getPositions: async () => [],
          getOrders: async () => [],
          placeOrder: async () => ({ id: "mock" }),
        };
      },
    },
  });
  await new Promise<void>((res) => testServer.listen(0, () => res()));
  const port = (testServer.address() as any).port;
  const res = await fetch(`http://127.0.0.1:${port}/callback?code=test-auth-code`, {
    redirect: "manual",
  });
  expect(res.status).toBe(302);
  expect(res.headers.get("location")).toBe("/?broker=connected");
  expect(connectedCode).toBe("test-auth-code");
  testServer.close();
});

it("GET /callback with error redirects to /?broker=error", async () => {
  const res = await fetch(`${base}/callback?error=access_denied`, {
    redirect: "manual",
  });
  expect(res.status).toBe(302);
  expect(res.headers.get("location")).toContain("broker=error");
});

it("POST /api/broker/disconnect clears broker auth", async () => {
  let disconnected = false;
  const testServer = await createServer({
    port: 0,
    deps: {
      disconnectUpstox: () => {
        disconnected = true;
      },
    },
  });
  await new Promise<void>((res) => testServer.listen(0, () => res()));
  const port = (testServer.address() as any).port;
  const res = await fetch(`http://127.0.0.1:${port}/api/broker/disconnect`, {
    method: "POST",
  });
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.ok).toBe(true);
  expect(disconnected).toBe(true);
  testServer.close();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/server.test.ts`  
Expected: FAIL with status 404 for `/callback` and `/api/broker/disconnect`.

- [ ] **Step 3: Implement `/callback` and `/api/broker/disconnect` in `src/server.ts`**

Update `ServerDeps`:
```ts
export interface ServerDeps {
  upstox: UpstoxClient | Broker;
  yahoo: YahooFinanceService;
  getFundamentals?: () => Promise<Fundamentals[]>;
  ollama?: OllamaService;
  connectUpstox?: (code: string) => Promise<Broker>;
  disconnectUpstox?: () => void;
}
```

In `router(req, res, deps)`:
```ts
  if (pathname === "/callback") {
    const error = searchParams.get("error");
    if (error) {
      res.writeHead(302, { Location: `/?broker=error&message=${encodeURIComponent(error)}` });
      res.end();
      return;
    }
    const code = searchParams.get("code");
    if (!code) {
      res.writeHead(302, {
        Location: `/?broker=error&message=${encodeURIComponent("Missing authorization code")}`,
      });
      res.end();
      return;
    }
    try {
      const client = deps.connectUpstox
        ? await deps.connectUpstox(code)
        : await (async () => {
            await connectUpstox(code);
            return getUpstoxClient();
          })();
      deps.upstox = client;
      res.writeHead(302, { Location: "/?broker=connected" });
      res.end();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Authentication failed";
      res.writeHead(302, { Location: `/?broker=error&message=${encodeURIComponent(msg)}` });
      res.end();
    }
    return;
  }

  if (pathname === "/api/broker/disconnect" && req.method === "POST") {
    if (deps.disconnectUpstox) {
      deps.disconnectUpstox();
    } else {
      disconnectUpstox();
    }
    deps.upstox = getUpstoxClient();
    sendJson(res, 200, { ok: true });
    return;
  }
```

In `createServer()` default deps:
```ts
  disconnectUpstox: opts.deps?.disconnectUpstox ?? (() => disconnectUpstox()),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/server.test.ts`  
Expected: PASS.

- [ ] **Step 5: Run linter and typecheck**

Run: `pnpm check`  
Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/server.ts tests/server.test.ts
git commit -m "feat(server): add /callback OAuth handler and /api/broker/disconnect route"
```

---

### Task 3: Upstream 401 token expiration handling in server

**Files:**
- Modify: `src/server.ts:210-298`
- Test: `tests/server.test.ts`

**Interfaces:**
- Consumes: Axios error structure (`isAxiosError` or `e.response?.status === 401`).
- Produces: HTTP 401 `{ error: string, expired: true }` when Upstox session token expires, automatically clearing token from DB.

- [ ] **Step 1: Write failing test in `tests/server.test.ts`**

Add test verifying 401 interception:
```ts
it("GET /api/portfolio returns 401 and clears session when Upstox returns 401", async () => {
  let disconnected = false;
  const mockExpiredBroker: Broker = {
    name: "upstox",
    isAuthenticated: true,
    getAuthUrl: () => "",
    authenticate: async () => {},
    getHoldings: async () => {
      const err = new Error("Request failed with status code 401") as any;
      err.response = { status: 401 };
      throw err;
    },
    getPositions: async () => [],
    getOrders: async () => [],
    placeOrder: async () => ({ id: "mock" }),
  };

  const testServer = await createServer({
    port: 0,
    deps: {
      upstox: mockExpiredBroker,
      disconnectUpstox: () => {
        disconnected = true;
      },
    },
  });
  await new Promise<void>((res) => testServer.listen(0, () => res()));
  const port = (testServer.address() as any).port;

  const res = await fetch(`http://127.0.0.1:${port}/api/portfolio`);
  expect(res.status).toBe(401);
  const data = await res.json();
  expect(data.expired).toBe(true);
  expect(disconnected).toBe(true);
  testServer.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/server.test.ts`  
Expected: FAIL (status was 500 instead of 401).

- [ ] **Step 3: Implement 401 error interception in `src/server.ts`**

Add helper function in `src/server.ts`:
```ts
function isAuthExpiredError(e: unknown): boolean {
  if (typeof e === "object" && e !== null) {
    const status = (e as { response?: { status?: number } }).response?.status;
    if (status === 401 || status === 403) return true;
    const message = (e as { message?: string }).message;
    if (typeof message === "string" && (message.includes("401") || /not authenticated/i.test(message))) {
      return true;
    }
  }
  return false;
}

function handleBrokerError(e: unknown, res: http.ServerResponse, deps: ServerDeps): void {
  if (isAuthExpiredError(e)) {
    if (deps.disconnectUpstox) {
      deps.disconnectUpstox();
    } else {
      disconnectUpstox();
    }
    deps.upstox = getUpstoxClient();
    sendJson(res, 401, {
      error: "Upstox session expired. Please re-authorize.",
      expired: true,
    });
    return;
  }
  sendJson(res, 500, { error: e instanceof Error ? e.message : "Broker request failed" });
}
```

In `router`, update catch blocks for `/api/portfolio`, `/api/orders`, and `/api/trade`:
```ts
  if (pathname === "/api/portfolio") {
    try {
      // ... existing code ...
    } catch (e) {
      handleBrokerError(e, res, deps);
    }
    return;
  }

  if (pathname === "/api/orders") {
    try {
      // ... existing code ...
    } catch (e) {
      handleBrokerError(e, res, deps);
    }
    return;
  }

  if (pathname === "/api/trade" && req.method === "POST") {
    // ...
    try {
      // ...
    } catch (e) {
      handleBrokerError(e, res, deps);
    }
    return;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/server.test.ts`  
Expected: PASS.

- [ ] **Step 5: Run linter and typecheck**

Run: `pnpm check`  
Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/server.ts tests/server.test.ts
git commit -m "feat(server): intercept 401 expired broker tokens and clear session"
```

---

### Task 4: Frontend UI for OAuth callback toast, session expiry, and disconnect

**Files:**
- Modify: `public/index.html:70-77`
- Modify: `public/app.js:350-385`
- Modify: `public/style.css`

**Interfaces:**
- Consumes: `/api/broker`, `/api/broker/disconnect`, `/?broker=connected`, `/?broker=error`.
- Produces: Dynamic status banner, interactive Disconnect button, and inline Re-authorization trigger on expired sessions.

- [ ] **Step 1: Add broker notice banner to `public/index.html`**

In `public/index.html`, inside `<section id="tab-portfolio">` right before the broker status card:
```html
<div id="broker-notice" class="hidden" style="margin-bottom: 1rem;"></div>
```

- [ ] **Step 2: Add styles in `public/style.css`**

Add classes for the broker notification banner and action buttons:
```css
.broker-banner {
  padding: 0.75rem 1rem;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.broker-banner.success {
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.4);
  color: #22c55e;
}
.broker-banner.error {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #ef4444;
}
.btn-outline-danger {
  background: transparent;
  border: 1px solid #ef4444;
  color: #ef4444;
  margin-left: 0.5rem;
}
.btn-outline-danger:hover {
  background: #ef4444;
  color: #fff;
}
```

- [ ] **Step 3: Update `loadBrokerStatus` and OAuth redirect handling in `public/app.js`**

In `public/app.js`:
```js
function showBrokerNotice(type, text) {
  const noticeEl = document.getElementById("broker-notice");
  if (!noticeEl) return;
  noticeEl.className = `broker-banner ${type}`;
  noticeEl.innerHTML = `<span>${text}</span><button type="button" class="btn btn-sm" style="margin-left:1rem;" onclick="this.parentElement.classList.add('hidden')">✕</button>`;
  noticeEl.classList.remove("hidden");
}

function checkOAuthParams() {
  const params = new URLSearchParams(window.location.search);
  const brokerParam = params.get("broker");
  if (brokerParam === "connected") {
    showBrokerNotice("success", "Connected to Upstox successfully!");
    window.history.replaceState({}, document.title, window.location.pathname);
    // Switch to portfolio tab to show connected status
    document.querySelector('.tab-btn[data-tab="portfolio"]')?.click();
  } else if (brokerParam === "error") {
    const msg = params.get("message") || "Authorization failed";
    showBrokerNotice("error", `Upstox authorization error: ${msg}`);
    window.history.replaceState({}, document.title, window.location.pathname);
    document.querySelector('.tab-btn[data-tab="portfolio"]')?.click();
  }
}

// Broker status
async function loadBrokerStatus() {
  const el = document.getElementById("broker-status");
  if (!el) return;
  try {
    const res = await fetch("/api/broker");
    const b = await res.json();
    const authUrl = b.authUrl || "/api/broker";
    if (b.authenticated) {
      el.innerHTML = `
        <span class="positive">● Connected to Upstox</span>
        <button type="button" class="btn btn-sm btn-outline-danger" id="broker-disconnect-btn">Disconnect</button>
      `;
      document.getElementById("broker-disconnect-btn")?.addEventListener("click", async () => {
        if (!confirm("Are you sure you want to disconnect Upstox?")) return;
        try {
          await fetch("/api/broker/disconnect", { method: "POST" });
          showBrokerNotice("success", "Disconnected from Upstox.");
          loadBrokerStatus();
          loadPortfolio();
          loadOrders();
        } catch (e) {
          alert(`Failed to disconnect: ${e.message}`);
        }
      });
    } else {
      el.innerHTML = `<span class="negative">○ Not connected</span> <button class="btn" onclick="window.open('${authUrl}', '_self')">Authorize</button>`;
    }
  } catch (e) {
    el.innerHTML = `<span class="error">${e.message}</span>`;
  }
}
```

In `loadPortfolio` and `loadOrders`, detect 401 and expired status:
```js
    const res = await fetch("/api/portfolio");
    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      if (res.status === 401 || errData?.expired) {
        const brokerEl = document.getElementById("broker-status");
        if (brokerEl) {
          const authRes = await fetch("/api/broker").catch(() => null);
          const b = authRes ? await authRes.json() : {};
          const authUrl = b.authUrl || "/api/broker";
          brokerEl.innerHTML = `<span class="negative">○ Session expired</span> <button class="btn" onclick="window.open('${authUrl}', '_self')">Re-authorize</button>`;
        }
      }
      throw new Error(errData?.error || "Failed to load portfolio");
    }
```

At bottom of `public/app.js`:
```js
checkOAuthParams();
```

- [ ] **Step 4: Verify in browser / build**

Run: `pnpm check && pnpm build`  
Expected: Clean pass with 0 errors.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/app.js public/style.css
git commit -m "feat(ui): add OAuth redirect notice, disconnect button, and session expiry prompt"
```

---

### Task 5: Documentation updates and full test suite verification

**Files:**
- Modify: `docs/upstox-trading.md:25-55`
- Modify: `README.md`
- Test: Full vitest suite

**Interfaces:**
- Consumes: Final codebase state.
- Produces: Accurate user & developer documentation reflecting the automated callback flow and session management.

- [ ] **Step 1: Update `docs/upstox-trading.md`**

Update the OAuth flow steps in `docs/upstox-trading.md`:
- Step 1: Click "Authorize" in the StockPulse dashboard.
- Step 2: Log in and approve on Upstox.
- Step 3: Upstox automatically redirects to `http://localhost:8787/callback`, which captures the code, persists the token in SQLite, and redirects back to the dashboard with a success confirmation.
- Document `POST /api/broker/disconnect` and automatic 401 session expiry handling.

- [ ] **Step 2: Run all checks and tests**

Run:
```bash
pnpm check
pnpm test
pnpm build
```
Expected: All linters pass, all tests pass (expected 90+ tests), and TypeScript builds without errors.

- [ ] **Step 3: Commit**

```bash
git add docs/upstox-trading.md README.md
git commit -m "docs: update Upstox trading guide with automated OAuth callback flow"
```
