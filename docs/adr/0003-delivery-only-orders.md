# Orders are delivery, not Positions

StockPulse places Orders as delivered ownership so a fill updates a Holding. The Broker role can still *read* Positions (intraday / short-term exposure), but the product does not open them: there is no Order request that means "intraday." That keeps research-plus-confirm trading on the same long-term book the Portfolio and Recommendations describe.

## Considered Options

- **Intraday (or user-chosen product).** Rejected: a Recommendation is about a Holding the user already owns across sessions; mixing in same-day Positions would split "what we advise on" from "what an Order just did."
- **Delivery only (chosen).** Every confirmed Order is a delivery fill. Positions remain a venue fact the Broker may report, not something StockPulse creates.
