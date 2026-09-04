import axios from "axios";

/**
 * Local AI inference via Ollama.
 * Detects whether the local Ollama server is running so the UI can show an
 * optional AI deep-dive panel; no cloud calls.
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
}
