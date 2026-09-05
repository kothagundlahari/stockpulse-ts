import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appSource = fs.readFileSync(path.join(process.cwd(), "public/app.js"), "utf8");

describe("personality stock research links", () => {
  it("opens the selected stock in Perplexity Finance from the symbol button", () => {
    expect(appSource).toContain(
      'window.open(buildPerplexityFinanceUrl(symbol), "_blank", "noopener,noreferrer")',
    );
    expect(appSource).toContain(
      "https://www.perplexity.ai/search/new?q=$" + "{encodeURIComponent(query)}",
    );
  });
});
