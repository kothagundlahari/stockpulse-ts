import fs from "node:fs";
import path from "node:path";

export function localTlsCertPaths(cwd = process.cwd()): { certPath: string; keyPath: string } {
  return {
    certPath: path.join(cwd, "certs", "localhost.pem"),
    keyPath: path.join(cwd, "certs", "localhost-key.pem"),
  };
}

export function localTlsCertsPresent(cwd = process.cwd()): boolean {
  const { certPath, keyPath } = localTlsCertPaths(cwd);
  return fs.existsSync(certPath) && fs.existsSync(keyPath);
}

/** macOS + Safari HTTPS-Only: the dashboard process must not fall back to HTTP. */
export function macosRequiresLocalTls(platform: NodeJS.Platform): boolean {
  return platform === "darwin";
}

export function macosMkcertHelp(): string {
  return [
    "HTTPS certs missing. Safari will not load http://localhost.",
    "Install mkcert, trust the local CA, then create certs (certs/ is gitignored):",
    "",
    "  brew install mkcert",
    "  mkcert -install",
    "  mkdir -p certs",
    "  mkcert -key-file certs/localhost-key.pem -cert-file certs/localhost.pem localhost",
    "",
  ].join("\n");
}

export function browserOpenCommand(
  platform: NodeJS.Platform,
  url: string,
): { cmd: string; args: string[] } {
  if (platform === "darwin") {
    return { cmd: "open", args: ["-a", "Safari", url] };
  }
  if (platform === "win32") {
    return { cmd: "start", args: [] };
  }
  return { cmd: "xdg-open", args: [url] };
}
