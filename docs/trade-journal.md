# Trade Journal

The trade journal records your trades with context so you can review and improve your process. It persists to SQLite via `src/services/database.ts`.

## What a journal entry contains

| Field | Required | Description |
|---|---|---|
| `symbol` | ✅ | Stock symbol (e.g. `RELIANCE`) |
| `action` | ✅ | `BUY` or `SELL` |
| `price` | ✅ | Execution price |
| `quantity` | ✅ | Number of shares |
| `date` | ✅ | Auto-set to now |
| `notes` | ❌ | Free-form notes |
| `emotions` | ❌ | How you felt (fear, greed, calm...) |
| `lessons` | ❌ | What you learned |
| `pnl` | ❌ | Realized P&L (for SELL entries) |

Capturing emotions and lessons is what turns a simple log into a **learning tool** — it helps you spot emotional trading patterns over time.

## CLI usage

### Add an entry (interactive)

```bash
node dist/cli/index.js journal --add
```

You'll be prompted for symbol, action, price, quantity, and optional notes.

### List entries

```bash
node dist/cli/index.js journal --list
```

Shows all entries newest-first, color-coded (green BUY / red SELL).

## Storage

Entries are stored in the `journal` table of `./data/stockpulse.db` (SQLite). The database uses WAL mode for reliability. The `data/` directory is gitignored, so your journal stays local.

```
CREATE TABLE journal (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  date TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('BUY','SELL')),
  price REAL NOT NULL,
  quantity INTEGER NOT NULL,
  pnl REAL,
  notes TEXT,
  emotions TEXT,
  lessons TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

## Using the API for programmatic access

```ts
import { DatabaseService } from "./src/services/database.js";

const db = new DatabaseService();
db.addJournalEntry({
  id: crypto.randomUUID(),
  symbol: "TCS",
  date: new Date().toISOString(),
  action: "BUY",
  price: 3500,
  quantity: 10,
  notes: "Earnings beat, strong technicals",
  emotions: "Confident",
  lessons: "Entry timing mattered",
});
db.close();
```

## Design notes

- **SQLite is the single source of truth.** Unlike the original Swift app (which mirrored to a git-tracked `Knowledge/` folder), this keeps one authoritative store with no sync bugs.
- Reset/delete is handled at the DB layer (`deleteJournalEntry`); the CLI can be extended to expose it.
