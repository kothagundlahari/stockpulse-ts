# Trade Journal

The trade journal records your trades with context so you can review and improve your process. It persists to SQLite via `src/services/database.ts`.

StockPulse has two sources of trade history:

1. **Broker trade history** — orders fetched from Upstox via the Portfolio tab (see [Upstox Trading](upstox-trading.md))
2. **Manual journal** — your personal trade log with notes, emotions, and lessons (this document)

## What a journal entry contains

| Field | Required | Description |
|---|---|---|
| `symbol` | Yes | Stock symbol (e.g. `RELIANCE`) |
| `action` | Yes | `BUY` or `SELL` |
| `price` | Yes | Execution price |
| `quantity` | Yes | Number of shares |
| `date` | Yes | Auto-set to now |
| `notes` | No | Free-form notes |
| `emotions` | No | How you felt (fear, greed, calm...) |
| `lessons` | No | What you learned |
| `pnl` | No | Realized P&L (for SELL entries) |

Capturing emotions and lessons is what turns a simple log into a **learning tool** — it helps you spot emotional trading patterns over time.

## Dashboard usage

The Journal tab in the dashboard shows all entries from the SQLite database. You can browse your trade history alongside the broker trade history in the Portfolio tab.

## Using the API

```
GET /api/journal
```

Returns all journal entries as JSON.

## Storage

Entries are stored in the `journal` table of `./data/stockpulse.db` (SQLite). The database uses WAL mode for reliability. The `data/` directory is gitignored, so your journal stays local.

```sql
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
- Reset/delete is handled at the DB layer (`deleteJournalEntry`).
- Broker trade history (from Upstox) is fetched live via the Portfolio tab and is separate from the manual journal entries.
