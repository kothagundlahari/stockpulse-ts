# AGENTS.md

TypeScript web dashboard for Indian stock research (StockPulse). `type: module`, ESM with Node16 resolution — **all relative imports must use `.js` extensions** even when importing `.ts` files.

## Commands (use pnpm, not npm/yarn)

```bash
pnpm install        # deps (pnpm-workspace.yaml; better-sqlite3 + esbuild need allowBuilds)
pnpm check          # biome lint/format check + tsc --noEmit  ← run after changes
pnpm build          # tsc → dist/ (rootDir=src, so build output mirrors src/)
pnpm test           # vitest run
npx vitest run tests/screener.test.ts   # single test file
```

- `tsc` is the build tool (no bundler). `pnpm check` is the fastest full verification (lint + typecheck).
- `pnpm dev` sets `OPEN_BROWSER=1` and starts the web dashboard on `PORT` (default 8787); `pnpm dev:server` runs it without opening the browser; `pnpm start:server` runs the built `node dist/server.js`.
- There is no CLI — the web dashboard is the only interface. Rebuild (`pnpm build`) before smoke-testing `node dist/server.js`.

## Architecture

- `src/engines/` — pure logic, no I/O (screener, backtest, holding-recommendation). These are the most tested.
- `src/data/` — dynamic NIFTY 500 universe (`nifty500.ts` fetches the symbol list live from the NSE index CSV, fundamentals per-symbol from Yahoo, cached); `nifty50.ts` holds only the 8 personality filters.
- `src/services/` — thin wrappers for external I/O: Yahoo Finance, Upstox (`upstox.ts` broker client + `broker.ts` factory, see `broker-types.ts` for the shared `Broker` interface), Ollama, news, SQLite (`database.ts`).
- `src/types/index.ts` — shared Zod schemas + inferred types; validate at every external boundary.
- `src/server.ts` — raw Node `http` server (no framework) for the dashboard + JSON API; serves `public/`. Handles GET and POST (`/api/trade`, `/api/broker/auth`).

Keep testable pure logic in engines, not in the server. If behavior is testable without network/DB, it belongs in an engine.

## Code standards

- Strict TS, no `any` (use `unknown` + narrowing).
- Biome: preset `recommended`, double quotes, semicolons always, 2-space indent, 100-col width.
- No comments unless needed; no unnecessary abstraction layers.
- Auth/secrets via `process.env` (e.g. Upstox app id/secret) from a gitignored `.env`; never commit these.

## Gotchas

- **Yahoo Finance**: fetches use the chart endpoint with a browser `User-Agent` header (commit `21fb370`); keep that header or quotes/backtests fail.
- **`biome check` ignores `dist/`, `node_modules/`, `data/`, `public/`** (see `biome.json` `files.includes`).
- **Data layer**: `data/stockpulse.db` (SQLite) and `data/` are gitignored; tests for the DB use a temp DB.
- **Ollama** (`src/services/ollama.ts`) talks to `http://localhost:11434` — no cloud calls; requires Ollama running locally.

## Docs

The `docs/` directory (`development.md`, `architecture.md`, `getting-started.md`, etc.) contains thorough, current guidance — read the relevant doc rather than re-deriving it. `docs/development.md` has the full TDD workflow; `docs/architecture.md` covers adding a feature.
