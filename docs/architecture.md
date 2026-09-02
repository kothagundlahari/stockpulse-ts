# Architecture

StockPulse is deliberately simple. It avoids the multi-layered service/view-model architecture of the original Swift app in favor of a clean, testable separation.

## High-level structure

```
┌─────────────────────────────────────────────┐
│                 CLI (commander)             │
│   src/cli/                                  │
├─────────────────────────────────────────────┤
│               Engines (pure logic)          │
│   src/engines/screener.ts                   │
│   src/engines/backtest.ts                   │
├─────────────────────────────────────────────┤
│            Services (integrations)          │
│   yahoo-finance │ fyers │ ollama │ news     │
│   database                                   │
├─────────────────────────────────────────────┤
│              Types (Zod schema)             │
│   src/types/                                │
└─────────────────────────────────────────────┘
```

## Layer responsibilities

### 1. CLI layer (`src/cli/`)
- Parses commands and options
- Calls into engines/services
- Formats output for the terminal
- Contains **no business logic** — just IO and presentation

### 2. Engines (`src/engines/`)
Pure, dependency-free business logic:
- **`screener.ts`** — filters a list of stocks by criteria
- **`backtest.ts`** — runs a strategy over price history

These are the most heavily tested components. They take plain data in, return plain data out, and have no side effects.

### 3. Services (`src/services/`)
Everything that talks to the outside world:
- **`yahoo-finance.ts`** — live quotes, historical prices, search
- **`fyers.ts`** — FYERS API: OAuth auth, quotes, order placement
- **`ollama.ts`** — local AI chat completions
- **`news.ts`** — RSS fetching/parsing
- **`database.ts`** — SQLite persistence (journal + screeners)

Services are thin wrappers around external APIs. Validation happens at the boundary (see below).

### 4. Types (`src/types/`)
Every shared data shape is a **Zod schema** with an inferred TypeScript type:

```ts
const StockSchema = z.object({
  symbol: z.string().min(1),
  name: z.string().min(1),
  exchange: z.enum(["NSE", "BSE"]),
});
type Stock = z.infer<typeof StockSchema>;
```

This gives you **runtime validation + compile-time safety at no extra cost** — a cleaner alternative to hand-written interfaces or full ORMs.

## Design decisions (and what we deliberately removed)

The original Swift app followed MVVM with `AppState`, `OllamaStatus` enums, notification observation, and a `Knowledge/` git-sync layer. This rebuild removes redundancy:

- **No global mutable state** — CLI commands are stateless; everything is passed explicitly
- **No ViewModel layer** — there's no GUI, so the extra indirection is unnecessary
- **No separate "models" and "services" folders for pure types** — all types live in one place
- **No git-tracked knowledge mirror** — SQLite is the single source of truth; simpler and no sync bugs
- **No event bus / notification maintenance tasks** — replaced by simple awaits and dependency injection

## Concurrency

The CLI is single-threaded and uses `async/await`. Engines are pure functions, which makes them trivially parallelizable later if needed. There is no shared mutable state, so no locks or actors are required.

## Adding a new feature

1. Define the data shape in `src/types/`
2. Write a failing test in `tests/`
3. Implement the logic (engine or service) until the test passes
4. Wire it into the CLI with a new `commander` command
5. Document it in `docs/`

See the [Development Guide](development.md) for the full TDD workflow.
