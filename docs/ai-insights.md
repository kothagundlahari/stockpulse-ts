# AI Insights (Ollama)

Ollama integration is **optional** — the dashboard works fully without it. Today the integration only **detects whether a local Ollama server is running**; it does not yet generate analysis text. All checks are local (`http://localhost:11434`), so no data leaves your machine.

## Prerequisites

1. Install [Ollama](https://ollama.com): `brew install ollama` (macOS) or the listed installer for your OS
2. Start the server: `ollama serve`

## What the dashboard does

- On load, the Portfolio tab's "AI deep-dive" panel calls `GET /api/ai`.
- `GET /api/ai` returns `{ "available": true }` or `{ "available": false }` depending on whether the local Ollama server is reachable.
- If available, the panel shows *"Ollama detected — AI deep-dive available."* Otherwise it shows *"Ollama not detected — AI deep-dive disabled."*

## How it works

```ts
// src/services/ollama.ts
export class OllamaService {
  async isRunning(): Promise<boolean> {
    // GET /api/tags with a 2s timeout; true if HTTP 200
  }
}
```

The server health-check is the only call made:

```
GET /api/ai  →  { "available": true | false }
```

The prior insight-generation methods (`listModels`, `generateInsight`, and the chat prompt producing ratings/strengths/risks/valuations) were removed — no production code consumes them. If you add a real analysis pipeline later, extend `OllamaService` with a generation method and wire it into the `ai-deepdive` panel.

## Privacy

- All checks are **local** — no cloud API keys, no data upload.
- Anything shown is **educational**, not financial advice. Always do your own research and consult a professional before making decisions.

## Troubleshooting

**"Ollama not detected"**
Start it with `ollama serve` and confirm with `curl http://localhost:11434/api/tags`. If it returns `200`, the panel should report the server as available.
