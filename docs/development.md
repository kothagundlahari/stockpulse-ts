# Development Guide

Guide for contributors. Built with **TDD** and practical TypeScript standards.

## Project setup

```bash
npm install        # install dependencies
npm run build      # type-check + compile to dist/
npm test           # run all tests (vitest)
```

## TDD workflow

StockPulse is developed test-first. The workflow:

1. **Write a failing test** — describe the expected behavior in `tests/`
2. **Run it** — confirm it fails (`npm test`)
3. **Write the minimal implementation** to make it pass
4. **Run the full suite** — ensure nothing regressed
5. **Refactor** — clean up while keeping tests green

This guarantees the engines and services are correct by construction and safe to refactor.

### Test structure

- `tests/types.test.ts` — Zod schema validation
- `tests/screener.test.ts` — screener engine
- `tests/backtest.test.ts` — backtesting engine
- `tests/database.test.ts` — SQLite persistence (uses a temp DB)
- `tests/yahoo-finance.test.ts` — API client (mocked axios)

Run a single file:

```bash
npx vitest run tests/screener.test.ts
```

## Naming & layout

- **Engines** (`src/engines/`) — pure logic, no I/O, no dependencies
- **Services** (`src/services/`) — I/O: HTTP, DB, external systems
- **Types** (`src/types/`) — shared Zod schemas
- **CLI** (`src/cli/`) — command wiring and presentation only

Keep business logic in engines, not in the CLI. If a behavior is testable without a network or database, it belongs in an engine.

## Code standards

- **Strict TypeScript** — `tsconfig.json` sets `strict: true`. No `any` (uses `unknown` + narrowing).
- **ESM** — `"type": "module"`, imports use `.js` extensions (Node16 resolution).
- **Runtime validation** — use Zod at boundaries rather than trusting external input.
- **No comments unless needed** — prefer self-documenting code; use JSDoc only for public API meaning.
- **No redundant patterns** — don't add interfaces/services/abstractions unless they earn their keep. The original Swift app was over-layered; this project favors the minimum that stays clean.

## Verification commands

```bash
npm run build       # tsc compile (catches type errors)
npm test            # full suite
node dist/cli/index.js --help   # smoke-test the CLI after build
```

Run all three after making changes.

## Adding a new command

1. Implement logic as an engine or a method on a service
2. Write/update tests
3. Register the command in `src/cli/index.ts` with `commander`
4. Add a command to the CLI `--help` and document it in `docs/`

## Environment variables

| Variable | Used for |
|---|---|
| `FYERS_APP_ID` | FYERS OAuth app ID |
| `FYERS_SECRET` | FYERS app secret |

Load them from a `.env` (gitignored) or export them in your shell. Never commit them.

## Common tasks

**Recompile after edits:**
```bash
npm run build
```

**Watch mode for tests while developing:**
```bash
npm run test:watch
```

**Type-only check without emitting:**
```bash
npx tsc --noEmit
```
