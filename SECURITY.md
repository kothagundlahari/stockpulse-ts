# Security Policy

StockPulse is a local-only research dashboard. It does not expose a public
service, but security issues should still be reported privately.

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.x     | ✅        |

## Reporting a Vulnerability

Please report security issues privately rather than opening a public issue:

- Open a GitHub issue on this repository with a **security** label, or
- Email the maintainer at `kothagundlahari@gmail.com` (address listed in
  the project README).

You can expect an initial response within one week. Confirmed issues are
fixed in the next normal release.

## Posture

- The server binds to `127.0.0.1` by default; it is not designed to be
  exposed to the internet (override the bind with `HOST=0.0.0.0` only on
  networks you trust).
- Upstox OAuth uses a `state` parameter to prevent account-linking CSRF.
- Secrets live only in a gitignored `.env` file and are never committed.
