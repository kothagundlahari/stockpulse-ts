import axios from "axios";

export interface OllamaModel {
  name: string;
  size: number;
  modifiedAt: string;
}

/**
 * Local AI inference via Ollama.
 * Provides chat completions for AI stock insights without any cloud calls.
 */
export class OllamaService {
  private baseUrl = "http://localhost:11434";

  async isRunning(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`, {
        timeout: 2000,
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<OllamaModel[]> {
    const response = await axios.get(`${this.baseUrl}/api/tags`);
    return response.data.models as OllamaModel[];
  }

  async generateInsight(
    model: string,
    symbol: string,
    fundamentals: Record<string, unknown>,
  ): Promise<string> {
    const prompt = `You are an expert Indian stock analyst. Analyze ${symbol} with these fundamentals:
${JSON.stringify(fundamentals, null, 2)}

Provide a concise analysis with:
- Overall rating (Strong Buy / Buy / Hold / Sell)
- Key strengths
- Key risks
- Valuations perspective
- Recommendation rationale`;

    const response = await axios.post(`${this.baseUrl}/api/chat`, {
      model,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    });

    return response.data.message.content as string;
  }
}
