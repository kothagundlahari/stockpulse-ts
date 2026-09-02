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

// Load personalities + journal on startup
loadPersonalities();
loadJournal();
