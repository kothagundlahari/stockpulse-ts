import { describe, expect, it } from "vitest";
import { parseNifty500Csv } from "../src/data/nifty500.js";

const CSV =
  "Symbol,Company,\nRELIANCE,Reliance Industries Ltd,TCS,Tata Consultancy\nINFY,\nHDFCBANK,HDFC Bank,\n";

describe("NIFTY 500 universe", () => {
  it("parses the symbol column from the NSE CSV", () => {
    const symbols = parseNifty500Csv(CSV);
    expect(symbols).toContain("RELIANCE");
    expect(symbols).toContain("TCS");
    expect(symbols).toContain("HDFCBANK");
  });

  it("drops empty and duplicate symbols", () => {
    const symbols = parseNifty500Csv(CSV);
    const set = new Set(symbols);
    expect(symbols.length).toBe(set.size);
    expect(symbols.some((s) => !s)).toBe(false);
  });

  it("handles CSV without a header gracefully", () => {
    expect(parseNifty500Csv("RELIANCE,5\nTCS,99\n")).toContain("RELIANCE");
  });
});
