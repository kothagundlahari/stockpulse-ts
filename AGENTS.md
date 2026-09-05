# AGENTS.md

TypeScript web dashboard for Indian stock research (StockPulse). `type: module`, ESM with Node16 resolution — **all relative imports must use `.js` extensions** even when importing `.ts` files.

## Commands (use pnpm, not npm/yarn)

```bash
pnpm check          # biome lint/format check + tsc --noEmit  ← run after changes
pnpm build          # tsc → dist/ (rootDir=src, so build output mirrors src/)
pnpm test           # vitest run
pnpm dev:server     # run dev server via tsx without opening browser (default port 8787)
```

- There is no CLI — the web dashboard is the only interface. Rebuild (`pnpm build`) before testing `pnpm start:server`.
- Note: `pnpm check` typechecks `src/` and lints `tests/`. It ignores `public/` (vanilla HTML/JS/CSS). Verify frontend changes carefully.

## Architecture

- `src/engines/` — Pure business logic, no I/O (screener, backtest, holding-recommendation). Keep testable pure logic here rather than in server routes.
- `src/services/` — Thin I/O wrappers: Yahoo Finance, Upstox broker client (`upstox.ts`, `broker.ts` factory), SQLite (`database.ts`), news RSS, and Ollama.
- `src/data/` — Dynamic NIFTY 500 universe (live NSE CSV + Yahoo fundamentals) and investor personality criteria.
- `src/server.ts` — Raw Node `http`/`https` server (no Express) routing JSON API endpoints and serving static files from `public/`.
- `src/types/index.ts` — Shared Zod schemas + inferred types. Validate at external I/O boundaries.

## Code standards

- Strict TS, no `any` (use `unknown` + narrowing).
- Biome: preset `recommended`, double quotes, semicolons always, 2-space indent, 100-col width. Preserve existing comments and docstrings.
- Auth/secrets via `process.env` (e.g. Upstox app id/secret) from a gitignored `.env`; never commit these.

## Gotchas

- **Yahoo Finance**: Quotes and historical prices query the chart endpoint with a browser `User-Agent` header to prevent upstream 404/403 blocks. Fundamentals use `yahoo-finance2`.
- **Ollama**: Optional local service for AI availability checks (`/api/ai`). Not required for server operation or test runs.
- **Data layer**: Local database at `data/stockpulse.db` (gitignored). Tests use isolated temporary databases.

## Docs

Consult `docs/` (`architecture.md`, `development.md`, `upstox-trading.md`) for detailed feature guides and domain workflows.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles, label string equals role name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
