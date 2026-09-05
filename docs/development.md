# Development Guide

Guide for contributors. Built with **TDD** and practical TypeScript standards.

## Project setup

```bash
pnpm install        # install dependencies
pnpm build         # type-check + compile to dist/
pnpm test           # run all tests (vitest)
```

## TDD workflow

StockPulse is developed test-first. The workflow:

1. **Write a failing test** — describe the expected behavior in `tests/`
2. **Run it** — confirm it fails (`pnpm test`)
3. **Write the minimal implementation** to make it pass
4. **Run the full suite** — ensure nothing regressed
5. **Refactor** — clean up while keeping tests green

This guarantees the engines and services are correct by construction and safe to refactor.

### Test structure

- `tests/types.test.ts` — Zod schema validation
- `tests/screener.test.ts` — Criteria and Personality Screener runs
- `tests/personality-ranker.test.ts` — sector-benchmarked Personality scores
- `tests/personalities.test.ts` — Personality match assertions
- `tests/backtest.test.ts` — Backtest engine (Signals and Round-trips)
- `tests/holding-recommendation.test.ts` — holding Recommendation engine
- `tests/portfolio.test.ts` — `loadPortfolio` / `assemblePortfolio` (InMemoryBroker, no HTTP)
- `tests/in-memory-broker.test.ts` — in-process Broker adapter
- `tests/broker.test.ts` — Broker factory / session
- `tests/database.test.ts` — SQLite persistence and freshness (temp DB)
- `tests/yahoo-finance.test.ts` — API client (mocked axios)

Run a single file:

```bash
pnpm test -- tests/screener.test.ts
```

## Naming & layout

- **Engines** (`src/engines/`) — pure logic, no I/O
- **Services** (`src/services/`) — I/O: HTTP, DB, Broker adapters, portfolio intake
- **Types** (`src/types/`) — shared Zod schemas
- **Server** (`src/server.ts`) — HTTP transport and JSON API
- **Dashboard** (`public/`) — plain HTML/CSS/JS

Keep business logic in engines, not in the server or dashboard. If a behavior is testable without a network or database, it belongs in an engine.

## Code standards

- **Strict TypeScript** — `tsconfig.json` sets `strict: true`. No `any` (uses `unknown` + narrowing).
- **ESM** — `"type": "module"`, imports use `.js` extensions (Node16 resolution).
- **Runtime validation** — use Zod at boundaries rather than trusting external input.
- **No comments unless needed** — prefer self-documenting code; use JSDoc only for public API meaning.
- **No redundant patterns** — don't add interfaces/services/abstractions unless they earn their keep. The original Swift app was over-layered; this project favors the minimum that stays clean.

## Verification commands

```bash
pnpm check         # biome lint/format + tsc --noEmit (fastest full check)
pnpm build         # tsc compile (catches type errors)
pnpm test          # full test suite
```

Run `pnpm check` after making changes — it catches both lint and type errors without emitting output.

## Adding a new feature

1. Implement logic as an engine or a method on a service
2. Write/update tests
3. Add the server endpoint in `src/server.ts`
4. Add the UI tab/panel in `public/`
5. Document it in `docs/`

## Environment variables

| Variable | Used for |
|---|---|
| `UPSTOX_API_KEY` | Upstox OAuth app key |
| `UPSTOX_API_SECRET` | Upstox OAuth app secret |
| `UPSTOX_REDIRECT_URI` | OAuth redirect URI (default: `http://localhost:8787/callback`) |
| `PORT` | Server port (default `8787`) |
| `HOST` | Bind address (default `127.0.0.1`) |

Load them from a `.env` (gitignored) or export them in your shell. Never commit them.

## Common tasks

**Recompile after edits:**
```bash
pnpm build
```

**Watch mode for tests while developing:**
```bash
pnpm test:watch
```

**Type-only check without emitting:**
```bash
pnpm check
```
