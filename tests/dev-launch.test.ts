import { describe, expect, it } from "vitest";
import {
  browserOpenCommand,
  localTlsCertPaths,
  macosMkcertHelp,
  macosRequiresLocalTls,
} from "../src/dev-launch.js";

describe("dev launch", () => {
  it("requires local TLS on macOS only", () => {
    expect(macosRequiresLocalTls("darwin")).toBe(true);
    expect(macosRequiresLocalTls("linux")).toBe(false);
    expect(macosRequiresLocalTls("win32")).toBe(false);
  });

  it("opens Safari on macOS", () => {
    expect(browserOpenCommand("darwin", "https://localhost:8787")).toEqual({
      cmd: "open",
      args: ["-a", "Safari", "https://localhost:8787"],
    });
  });

  it("uses the default opener on other platforms", () => {
    expect(browserOpenCommand("linux", "https://localhost:8787")).toEqual({
      cmd: "xdg-open",
      args: ["https://localhost:8787"],
    });
  });

  it("points mkcert at gitignored localhost cert files", () => {
    const { certPath, keyPath } = localTlsCertPaths("/tmp/stockpulse");
    expect(certPath).toBe("/tmp/stockpulse/certs/localhost.pem");
    expect(keyPath).toBe("/tmp/stockpulse/certs/localhost-key.pem");
    const help = macosMkcertHelp();
    expect(help).toContain("mkcert -install");
    expect(help).toContain("certs/localhost.pem");
    expect(help).toContain("Safari");
  });
});
