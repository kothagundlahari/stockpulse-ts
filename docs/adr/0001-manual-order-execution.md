# Manual order execution (human-in-the-loop)

StockPulse *advises*, it never *auto-executes*. A `Recommendation` (BUY_MORE / HOLD / SELL) on a `Holding` is advisory output only; turning it into a real market `Order` requires the user to explicitly place and *confirm* the order (`placeOrder` with `confirm: true`). There is no path by which a `Recommendation` or `Signal` is translated into an `Order` automatically.

## Considered Options

- **Auto-execute on a high-confidence Recommendation.** Rejected: removes the user from the decision that moves real money; couples the research engine to live trading and amplifies the risk of a flawed signal.
- **Manual, confirmed placement (chosen).** Keeps a `Recommendation` and an `Order` as distinct concepts, with a `confirm: true` gate on every real order. The user always stays in the loop.
