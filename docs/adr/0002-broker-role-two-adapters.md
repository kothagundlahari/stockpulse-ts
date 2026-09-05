# Broker is a role with two adapters

The product talks to an execution venue through the Broker role, never through a venue name. Live trading uses Upstox; tests and offline work use an in-memory adapter that obeys the same confirmation gate (ADR-0001). Substituting adapters at that seam is how Broker-dependent flows stay deterministic without pretending there is only one client.

## Considered Options

- **Venue-shaped API (Upstox everywhere).** Rejected: every test and caller would couple to the live client or to global mocks.
- **Role + two adapters (chosen).** One live adapter, one in-memory adapter; `getBroker` returns the role.
