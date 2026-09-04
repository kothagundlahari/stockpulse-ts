# AI Insights (Ollama)

AI insights use a **local** Ollama installation, so all inference happens on your machine — no data leaves it. This is an optional, additive feature — the dashboard works fully without it.

## Prerequisites

1. Install [Ollama](https://ollama.com): `brew install ollama` (macOS) or the listed installer for your OS
2. Start the server: `ollama serve`
3. Pull at least one model: `ollama pull llama3` (or `qwen3:8b`, `mistral`, etc.)

## Usage

When Ollama is running, the Portfolio tab shows an AI deep-dive panel for any selected holding. If Ollama is not running, the panel is hidden — nothing else is affected.

Check Ollama availability via the API:

```
GET /api/ai
```

Returns `{ "available": true }` or `{ "available": false }`.

## What it generates

The service (`src/services/ollama.ts`) sends a structured prompt with the stock's fundamentals and asks for:

- Overall rating (Strong Buy / Buy / Hold / Sell)
- Key strengths
- Key risks
- Valuation perspective
- Recommendation rationale

## How it works

```ts
// src/services/ollama.ts
POST http://localhost:11434/api/chat
{
  model: "llama3",
  messages: [{ role: "user", content: prompt }],
  stream: false
}
```

The service exposes three methods:

| Method | Purpose |
|---|---|
| `isRunning()` | Health check against `/api/tags` |
| `listModels()` | Enumerate installed models |
| `generateInsight(model, symbol, fundamentals)` | Produce the analysis text |

## Privacy & safety

- All inference is **local** — no cloud API keys, no data upload.
- The output is **educational**, not financial advice. Always do your own research and consult a professional before making decisions.
- The insight depends heavily on the selected model's quality. Larger or finance-tuned models generally give better results.

## Troubleshooting

**"Ollama is not running"**
Start it with `ollama serve` and confirm with `curl http://localhost:11434/api/tags`.

**"No models installed"**
Run `ollama pull llama3` (or your model of choice), then retry.

**Slow / low-quality responses**
Try a larger or domain-specific model from the Ollama library.
