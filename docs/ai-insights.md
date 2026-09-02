# AI Insights (Ollama)

AI insights use a **local** Ollama installation, so all inference happens on your machine — no data leaves it.

## Prerequisites

1. Install [Ollama](https://ollama.com): `brew install ollama` (macOS) or the listed installer for your OS
2. Start the server: `ollama serve`
3. Pull at least one model: `ollama pull llama3` (or `qwen3:8b`, `mistral`, etc.)

## Usage

```bash
node dist/cli/index.js insight RELIANCE
```

By default it uses the first installed model. Specify one explicitly:

```bash
node dist/cli/index.js insight TCS --model llama3
```

## What it generates

The service (`src/services/ollama.ts`) sends a structured prompt with the stock's fundamentals and asks for:

- Overall rating (Strong Buy / Buy / Hold / Sell)
- Key strengths
- Key risks
- Valuation perspective
- Recommendation rationale

The model returns a free-text analysis, printed to the terminal.

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
