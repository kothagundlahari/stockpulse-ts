const money = (n) => `₹${Number(n).toLocaleString("en-IN")}`;
const formatMC = (n) => {
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L Cr`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K Cr`;
  return `${n.toFixed(0)} Cr`;
};
const num = (n) => (n == null || Number.isNaN(n) ? "—" : `${n}`);

// Tab switching
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");

    if (btn.dataset.tab === "portfolio") {
      loadBrokerStatus();
      loadPortfolio();
      loadOrders();
      loadAiAvailability();
    }
  });
});

// Quotes
document.getElementById("quote-fetch").addEventListener("click", async () => {
  const symbol = document.getElementById("quote-symbol").value;
  const el = document.getElementById("quote-result");
  el.innerHTML = "<p>Loading…</p>";
  try {
    const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
    if (!res.ok) throw new Error("Symbol not found");
    const q = await res.json();
    const cls = q.changePercent >= 0 ? "positive" : "negative";
    el.innerHTML = `
      <div class="metric-grid">
        <div class="metric"><div class="label">Price</div><div class="value">${money(q.ltp)}</div></div>
        <div class="metric ${cls}"><div class="label">Change</div><div class="value">${q.changePercent >= 0 ? "+" : ""}${q.changePercent.toFixed(2)}%</div></div>
        <div class="metric"><div class="label">Open</div><div class="value">${money(q.open)}</div></div>
        <div class="metric"><div class="label">Day High</div><div class="value">${money(q.high)}</div></div>
        <div class="metric"><div class="label">Day Low</div><div class="value">${money(q.low)}</div></div>
        <div class="metric"><div class="label">Volume</div><div class="value">${Number(q.volume).toLocaleString("en-IN")}</div></div>
      </div>`;
  } catch (e) {
    el.innerHTML = `<p class="error">${e.message}</p>`;
  }
});

// Personalities
async function loadPersonalities() {
  const el = document.getElementById("personality-list");
  el.innerHTML = "<p>Loading…</p>";
  try {
    const res = await fetch("/api/personalities");
    const data = await res.json();
    el.innerHTML = data.personalities
      .map(
        (p) => `
        <div class="personality">
          <h3>${p.name} <span style="color:var(--muted);font-weight:400">(${p.matches}/${data.total})</span></h3>
          <p class="desc">${p.description}</p>
          ${
            p.stocks.length
              ? `<table><thead><tr><th>Symbol</th><th>Market Cap</th><th>PE</th><th>ROE</th><th>Sector</th></tr></thead><tbody>
                  ${p.stocks
                    .map(
                      (s) =>
                        `<tr><td><strong>${s.symbol}</strong></td><td>${formatMC(s.marketCap)}</td><td>${num(s.peRatio)}</td><td>${num(s.roe)}</td><td>${s.sector ?? ""}</td></tr>`,
                    )
                    .join("")}
                </tbody></table>`
              : "<p class='error'>No matches</p>"
          }
        </div>`,
      )
      .join("");
  } catch (e) {
    el.innerHTML = `<p class="error">${e.message}</p>`;
  }
}

// Backtest
document.getElementById("bt-fetch").addEventListener("click", async () => {
  const symbol = document.getElementById("bt-symbol").value;
  const range = document.getElementById("bt-range").value;
  const el = document.getElementById("bt-result");
  el.innerHTML = "<p>Running…</p>";
  try {
    const res = await fetch(`/api/backtest?symbol=${encodeURIComponent(symbol)}&range=${range}`);
    if (!res.ok) throw new Error("Backtest failed");
    const data = await res.json();
    const r = data.result;
    const retCls = r.totalReturn >= 0 ? "positive" : "negative";
    el.innerHTML = `
      <h3>${symbol} — ${range} (SMA Crossover)</h3>
      <div class="metric-grid">
        <div class="metric"><div class="label">Initial</div><div class="value">${money(r.initialCapital)}</div></div>
        <div class="metric"><div class="label">Final</div><div class="value">${money(r.finalCapital)}</div></div>
        <div class="metric ${retCls}"><div class="label">Return</div><div class="value">${r.totalReturn >= 0 ? "+" : ""}${r.totalReturn.toFixed(2)}%</div></div>
        <div class="metric"><div class="label">Max DD</div><div class="value negative">${r.maxDrawdown.toFixed(2)}%</div></div>
        <div class="metric"><div class="label">Trades</div><div class="value">${r.trades.length}</div></div>
        <div class="metric"><div class="label">Win Rate</div><div class="value">${r.winRate.toFixed(1)}%</div></div>
      </div>
      ${r.trades.length ? renderTrades(r.trades) : "<p>No trades executed.</p>"}`;
  } catch (e) {
    el.innerHTML = `<p class="error">${e.message}</p>`;
  }
});

function renderTrades(trades) {
  return `<table><thead><tr><th>Entry</th><th>Exit</th><th>P&L</th></tr></thead><tbody>
    ${trades
      .map((t, i) => {
        const cls = t.pnl >= 0 ? "positive" : "negative";
        return `<tr><td>${t.entryDate}</td><td>${t.exitDate}</td><td class="${cls}">${t.pnl >= 0 ? "+" : ""}${money(t.pnl)}</td></tr>`;
      })
      .join("")}
  </tbody></table>`;
}

// Journal
async function loadJournal() {
  const el = document.getElementById("journal-list");
  try {
    const res = await fetch("/api/journal");
    const data = await res.json();
    if (!data.entries.length) {
      el.innerHTML = "<p>No journal entries yet.</p>";
      return;
    }
    el.innerHTML = data.entries
      .map((e) => {
        const cls = e.action === "BUY" ? "positive" : "negative";
        return `<div class="entry"><strong>${e.symbol}</strong> <span class="${cls}">${e.action}</span> ${e.quantity} @ ${money(e.price)} · ${e.date.split("T")[0]}</div>`;
      })
      .join("");
  } catch (e) {
    el.innerHTML = `<p class="error">${e.message}</p>`;
  }
}

// News
document.getElementById("news-fetch").addEventListener("click", async () => {
  const symbol = document.getElementById("news-symbol").value;
  const el = document.getElementById("news-list");
  el.innerHTML = "<p>Loading…</p>";
  try {
    const res = await fetch(`/api/news?symbol=${encodeURIComponent(symbol)}`);
    const data = await res.json();
    if (!data.length) {
      el.innerHTML = "<p>No news found.</p>";
      return;
    }
    el.innerHTML = data
      .map(
        (n) =>
          `<div class="news-item"><strong>${n.title}</strong><div class="meta">${n.source} · ${n.pubDate}</div></div>`,
      )
      .join("");
  } catch (e) {
    el.innerHTML = `<p class="error">${e.message}</p>`;
  }
});

// Broker status
async function loadBrokerStatus() {
  const el = document.getElementById("broker-status");
  if (!el) return;
  try {
    const res = await fetch("/api/broker");
    const b = await res.json();
    const authUrl = b.authUrl || "/api/broker";
    el.innerHTML = b.authenticated
      ? '<span class="positive">● Connected to Upstox</span>'
      : `<span class="negative">○ Not connected</span> <button class="btn" onclick="window.open('${authUrl}', '_blank')">Authorize</button>`;
  } catch (e) {
    el.innerHTML = `<span class="error">${e.message}</span>`;
  }
}

// Portfolio + recommendations
async function loadPortfolio() {
  const el = document.getElementById("portfolio-holdings");
  if (!el) return;
  el.innerHTML = "<p>Loading…</p>";
  try {
    const res = await fetch("/api/portfolio");
    if (!res.ok) throw new Error("Failed to load portfolio");
    const data = await res.json();
    if (!data.holdings || data.holdings.length === 0) {
      el.innerHTML = "<p>No holdings found.</p>";
      return;
    }
    el.innerHTML = data.holdings
      .map((h) => {
        const action = h.recommendation?.action ?? "HOLD";
        const recCls =
          action === "BUY_MORE"
            ? "positive"
            : action === "SELL"
              ? "negative"
              : "neutral";
        const pnlCls = (h.pnl ?? 0) >= 0 ? "positive" : "negative";
        const pnlPercentFormatted = (h.pnlPercent != null ? Number(h.pnlPercent) : 0).toFixed(2);
        const reasons = h.recommendation?.reasons?.length
          ? h.recommendation.reasons.join(" · ")
          : "";
        return `<div class="holding">
        <div class="row"><strong>${h.symbol}</strong> <span class="rec badge ${recCls}">${action.replace("_", " ")}</span></div>
        <div class="metric-grid">
          <div class="metric"><div class="label">Qty</div><div class="value">${h.quantity}</div></div>
          <div class="metric"><div class="label">Avg</div><div class="value">${money(h.averagePrice)}</div></div>
          <div class="metric"><div class="label">LTP</div><div class="value">${money(h.ltp)}</div></div>
          <div class="metric ${pnlCls}"><div class="label">P&L</div><div class="value">${h.pnl >= 0 ? "+" : ""}${money(h.pnl)} (${pnlPercentFormatted}%)</div></div>
          <div class="metric"><div class="label">Value</div><div class="value">${money(h.currentValue)}</div></div>
        </div>
        ${reasons ? `<p class="desc">${reasons}</p>` : ""}
      </div>`;
      })
      .join("");
  } catch (e) {
    el.innerHTML = `<p class="error">${e.message}</p>`;
  }
}

// Trade handlers
const tradeTypeEl = document.getElementById("trade-type");
if (tradeTypeEl) {
  tradeTypeEl.addEventListener("change", (e) => {
    const priceEl = document.getElementById("trade-price");
    if (priceEl) {
      priceEl.style.display = e.target.value === "LIMIT" ? "inline-block" : "none";
    }
  });
}

document.getElementById("trade-open")?.addEventListener("click", () => {
  const symbol = document.getElementById("trade-symbol").value.trim().toUpperCase();
  const qty = Number(document.getElementById("trade-qty").value);
  const side = document.getElementById("trade-side").value;
  const type = document.getElementById("trade-type").value;
  const priceEl = document.getElementById("trade-price");
  const limitPrice = priceEl && priceEl.value ? Number(priceEl.value) : undefined;

  if (!symbol || !qty || qty <= 0) {
    alert("Enter a symbol and a positive quantity.");
    return;
  }
  if (type === "LIMIT" && (!limitPrice || limitPrice <= 0)) {
    alert("Enter a positive limit price for LIMIT orders.");
    return;
  }

  const modal = document.getElementById("trade-modal");
  modal.classList.remove("hidden");
  modal.querySelector(".modal-summary").textContent =
    `${side} ${qty} × ${symbol} (${type}) — this places a REAL order with your broker.`;
});

document.getElementById("trade-cancel")?.addEventListener("click", () => {
  document.getElementById("trade-modal").classList.add("hidden");
});

document.getElementById("trade-confirm")?.addEventListener("click", async () => {
  const modal = document.getElementById("trade-modal");
  const symbol = document.getElementById("trade-symbol").value.trim().toUpperCase();
  const qty = Number(document.getElementById("trade-qty").value);
  const side = document.getElementById("trade-side").value;
  const type = document.getElementById("trade-type").value;
  const priceEl = document.getElementById("trade-price");
  const limitPrice = priceEl && priceEl.value ? Number(priceEl.value) : undefined;

  const payload = { symbol, side, qty, type, confirm: true };
  if (type === "LIMIT" && limitPrice != null) {
    payload.limitPrice = limitPrice;
  }

  try {
    const res = await fetch("/api/trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Order failed");
    alert(`Order placed: ${data.id}`);
    modal.classList.add("hidden");
    loadPortfolio();
    loadOrders();
  } catch (e) {
    alert(`Trade failed: ${e.message}`);
  }
});

// Orders
async function loadOrders() {
  const el = document.getElementById("portfolio-orders");
  if (!el) return;
  try {
    const res = await fetch("/api/orders");
    const data = await res.json();
    if (!data.orders || !data.orders.length) {
      el.innerHTML = "<p>No orders yet.</p>";
      return;
    }
    el.innerHTML = data.orders
      .map(
        (o) =>
          `<div class="entry"><strong>${o.symbol}</strong> <span class="${o.side === "BUY" ? "positive" : "negative"}">${o.side}</span> ${o.qty} @ ${money(o.price)} · ${o.status}</div>`,
      )
      .join("");
  } catch (e) {
    el.innerHTML = `<p class="error">${e.message}</p>`;
  }
}

// Optional AI deep-dive (Ollama)
async function loadAiAvailability() {
  const el = document.getElementById("ai-deepdive");
  if (!el) return;
  try {
    const res = await fetch("/api/ai");
    if (!res.ok) throw new Error();
    const data = await res.json();
    el.innerHTML = data.available
      ? '<button class="btn" id="ai-analyze">Analyze selected holding (Ollama)</button>'
      : '<p class="muted">Ollama not detected — AI deep-dive disabled.</p>';
  } catch {
    el.innerHTML = '<p class="muted">Ollama not detected — AI deep-dive disabled.</p>';
  }
}

// Startup
loadPersonalities();
loadJournal();
loadBrokerStatus();
loadPortfolio();
loadOrders();
loadAiAvailability();
