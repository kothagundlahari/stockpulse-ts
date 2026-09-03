import { describe, expect, it } from "vitest";
import { parseNifty500Csv } from "../src/data/nifty500.js";

const CSV =
  "Symbol,Company Name,Industry\n" +
  "RELIANCE,Reliance Industries Ltd,Energy\n" +
  "TCS,Tata Consultancy Services,IT\n" +
  "HDFCBANK,HDFC Bank,Banking\n" +
  "INFY,Infosys,Technology\n";

describe("NIFTY 500 universe", () => {
  it("parses only the Symbol column from the NSE CSV", () => {
    expect(parseNifty500Csv(CSV)).toEqual(["RELIANCE", "TCS", "HDFCBANK", "INFY"]);
  });

  it("does not leak company names as symbols", () => {
    const symbols = parseNifty500Csv(CSV);
    expect(symbols).not.toContain("RELIANCE INDUSTRIES LTD");
    expect(symbols).not.toContain("TATA CONSULTANCY SERVICES");
  });

  it("drops empty and duplicate symbols", () => {
    const symbols = parseNifty500Csv(
      "Symbol,Company Name,Industry\nRELIANCE,a,1\nRELIANCE,b,2\nHDFCBANK,c,3\n",
    );
    expect(symbols).toEqual(["RELIANCE", "HDFCBANK"]);
  });

  it("handles headerless CSV by reading the first cell", () => {
    expect(parseNifty500Csv("RELIANCE,5\nTCS,99\n")).toEqual(["RELIANCE", "TCS"]);
  });
});
