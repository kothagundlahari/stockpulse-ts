import fs from "node:fs";
import { describe, expect, it } from "vitest";

const indexHtml = fs.readFileSync("./public/index.html", "utf8");
const appJs = fs.readFileSync("./public/app.js", "utf8");
const serverTs = fs.readFileSync("./src/server.ts", "utf8");

describe("removed backtest frontend and API surfaces", () => {
  it("contains no backtest tab, panel, loader, or API route", () => {
    expect(indexHtml).not.toContain('data-tab="backtest"');
    expect(indexHtml).not.toContain('id="tab-backtest"');
    expect(serverTs).not.toContain("/api/backtest");
    expect(appJs).not.toContain("/api/backtest");
    expect(appJs).not.toContain("bt-fetch");
  });
});

describe("removed journal frontend and API surfaces", () => {
  it("contains no journal tab, panel, loader, or API route", () => {
    expect(indexHtml).not.toContain('data-tab="journal"');
    expect(indexHtml).not.toContain('id="tab-journal"');
    expect(serverTs).not.toContain("/api/journal");
    expect(appJs).not.toContain("/api/journal");
    expect(appJs).not.toContain("loadJournal");
  });
});

describe("frontend XSS hardening surfaces", () => {
  it("app.js contains no inline event handlers and uses the escape helper", () => {
    expect(appJs).not.toContain("onclick=");
    expect(appJs).toContain("escapeHtml");
  });
});
