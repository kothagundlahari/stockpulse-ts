const money = (n) => `₹${Number(n).toLocaleString("en-IN")}`;
const formatMC = (n) => {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L Cr`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K Cr`;
  return `${Number(n).toFixed(0)} Cr`;
};
const num = (n) => (n == null || Number.isNaN(n) ? "—" : `${n}`);

// Tab switching
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");

    if (btn.dataset.tab === "personalities") {
      const pList = document.getElementById("personality-list");
      if (!pList || !pList.querySelector(".personality-layout")) {
        loadPersonalities();
      }
    }

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

function navigateToTrade(symbol, side = "BUY") {
  const portfolioTabBtn = document.querySelector('.tab-btn[data-tab="portfolio"]');
  if (portfolioTabBtn) {
    portfolioTabBtn.click();
  }

  const symInput = document.getElementById("trade-symbol");
  if (symInput && symbol) {
    symInput.value = symbol;
    symInput.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const sideSelect = document.getElementById("trade-side");
  if (sideSelect) {
    sideSelect.value = side;
  }

  const qtyInput = document.getElementById("trade-qty");
  if (qtyInput) {
    setTimeout(() => {
      qtyInput.focus();
    }, 100);
  }
}

function buildPerplexityFinanceUrl(symbol) {
  const query = `${String(symbol).trim()} NSE stock financial analysis`;
  return `https://www.perplexity.ai/search/new?q=${encodeURIComponent(query)}`;
}

// Personalities State & Master-Detail Renderer
const personalitiesState = {
  data: null,
  activeId: null,
  loading: false,
};

let personalityTableState = {
  activePersonalityId: null,
  sortColumn: "score",
  sortDirection: "desc",
  sectorFilter: "ALL",
};

function renderPersonalityDetail(active, total) {
  const detailPane = document.getElementById("personality-detail-pane");
  if (!detailPane) return;

  personalityTableState.activePersonalityId = active.id;

  const stocks = active.stocks || [];
  const sectorCounts = new Map();
  for (const s of stocks) {
    const sec = s.sector?.trim() || "Other";
    sectorCounts.set(sec, (sectorCounts.get(sec) || 0) + 1);
  }
  const sectors = Array.from(sectorCounts.keys()).sort((a, b) => a.localeCompare(b));

  if (personalityTableState.sectorFilter !== "ALL" && !sectorCounts.has(personalityTableState.sectorFilter)) {
    personalityTableState.sectorFilter = "ALL";
  }

  const filteredStocks =
    personalityTableState.sectorFilter === "ALL"
      ? [...stocks]
      : stocks.filter((s) => (s.sector?.trim() || "Other") === personalityTableState.sectorFilter);

  const { sortColumn, sortDirection } = personalityTableState;
  const dir = sortDirection === "asc" ? 1 : -1;

  filteredStocks.sort((a, b) => {
    if (sortColumn === "symbol" || sortColumn === "sector") {
      const aVal = (a[sortColumn] ?? "").toString();
      const bVal = (b[sortColumn] ?? "").toString();
      return dir * aVal.localeCompare(bVal);
    }
    const aVal = a[sortColumn];
    const bVal = b[sortColumn];
    const aMissing = aVal == null || Number.isNaN(Number(aVal));
    const bMissing = bVal == null || Number.isNaN(Number(bVal));
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;
    return dir * (Number(aVal) - Number(bVal));
  });

  const getSortIndicator = (col) => {
    if (sortColumn !== col) return "";
    return `<span class="sort-indicator">${sortDirection === "asc" ? "▲" : "▼"}</span>`;
  };

  detailPane.innerHTML = `
    <div class="personality-detail-header">
      <div>
        <h3>${active.name}</h3>
        <p class="desc">${active.description}</p>
      </div>
      <div class="personality-detail-controls">
        ${
          stocks.length > 0
            ? `<select id="personality-sector-filter" class="form-select personality-sector-filter" aria-label="Filter by Sector">
                <option value="ALL"${personalityTableState.sectorFilter === "ALL" ? " selected" : ""}>All Sectors (${stocks.length})</option>
                ${sectors
                  .map(
                    (sec) =>
                      `<option value="${sec}"${personalityTableState.sectorFilter === sec ? " selected" : ""}>${sec} (${sectorCounts.get(sec)})</option>`,
                  )
                  .join("")}
              </select>`
            : ""
        }
        <div class="personality-match-pill">
          <strong>${active.matches}</strong> of ${total} stocks match
        </div>
      </div>
    </div>
    ${
      stocks.length > 0
        ? `<div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th class="sortable" data-sort="symbol">Symbol${getSortIndicator("symbol")}</th>
                  <th class="sortable" data-sort="marketCap">Market Cap${getSortIndicator("marketCap")}</th>
                  <th class="sortable" data-sort="peRatio">PE${getSortIndicator("peRatio")}</th>
                  <th class="sortable" data-sort="roe">ROE${getSortIndicator("roe")}</th>
                  <th class="sortable" data-sort="operatingMargin">Op Margin${getSortIndicator("operatingMargin")}</th>
                  <th class="sortable" data-sort="sector">Sector${getSortIndicator("sector")}</th>
                  <th class="sortable" data-sort="score">Score${getSortIndicator("score")}</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${
                  filteredStocks.length > 0
                    ? filteredStocks
                        .map(
                          (s) =>
                            `<tr>
                              <td>
                                <button type="button" class="personality-symbol-btn" data-symbol="${s.symbol}" title="Research ${s.symbol} in Perplexity Finance">
                                  ${s.symbol}
                                </button>
                              </td>
                              <td>${formatMC(s.marketCap)}</td>
                              <td>${num(s.peRatio)}</td>
                              <td class="${typeof s.roe === "number" && s.roe >= 15 ? "positive" : ""}">${typeof s.roe === "number" && !Number.isNaN(s.roe) ? `${s.roe.toFixed(1)}%` : "—"}</td>
                              <td>${typeof s.operatingMargin === "number" && !Number.isNaN(s.operatingMargin) ? `${s.operatingMargin.toFixed(1)}%` : "—"}</td>
                              <td>${s.sector?.trim() || "Other"}</td>
                              <td>
                                ${
                                  typeof s.score === "number"
                                    ? `<span class="score-badge ${s.score >= 80 ? "score-high" : s.score >= 60 ? "score-mid" : "score-low"}">${s.score}</span>`
                                    : "—"
                                }
                              </td>
                              <td>
                                <button type="button" class="btn btn-sm personality-buy-btn" data-symbol="${s.symbol}">
                                  Buy
                                </button>
                              </td>
                            </tr>`,
                        )
                        .join("")
                    : `<tr><td colspan="8" class="muted" style="text-align:center; padding: 1.5rem;">No stocks found in ${personalityTableState.sectorFilter} sector.</td></tr>`
                }
              </tbody>
            </table>
          </div>`
        : "<p class='muted' style='margin-top:1rem;'>No stocks in the NIFTY 500 currently meet this criteria.</p>"
    }`;

  const sectorFilterEl = detailPane.querySelector("#personality-sector-filter");
  if (sectorFilterEl) {
    sectorFilterEl.addEventListener("change", (e) => {
      personalityTableState.sectorFilter = e.target.value;
      renderPersonalityDetail(active, total);
    });
  }

  detailPane.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const col = th.dataset.sort;
      if (!col) return;
      if (personalityTableState.sortColumn === col) {
        personalityTableState.sortDirection =
          personalityTableState.sortDirection === "asc" ? "desc" : "asc";
      } else {
        personalityTableState.sortColumn = col;
        personalityTableState.sortDirection = col === "score" ? "desc" : "asc";
      }
      renderPersonalityDetail(active, total);
    });
  });

  detailPane.querySelectorAll(".personality-symbol-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const symbol = btn.dataset.symbol;
      if (symbol) {
        window.open(buildPerplexityFinanceUrl(symbol), "_blank", "noopener,noreferrer");
      }
    });
  });

  detailPane.querySelectorAll(".personality-buy-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const symbol = btn.dataset.symbol;
      if (symbol) {
        navigateToTrade(symbol, "BUY");
      }
    });
  });
}

function selectPersonality(id) {
  if (!personalitiesState.data) return;
  const { personalities, total } = personalitiesState.data;
  const active = personalities.find((p) => p.id === id) || personalities[0];
  if (personalitiesState.activeId !== active.id) {
    personalityTableState.sectorFilter = "ALL";
    personalityTableState.sortColumn = "score";
    personalityTableState.sortDirection = "desc";
  }
  personalitiesState.activeId = active.id;
  personalityTableState.activePersonalityId = active.id;

  // Toggle active class and aria-selected on buttons without re-rendering sidebar
  const sidebar = document.getElementById("personality-sidebar-list");
  if (sidebar) {
    sidebar.querySelectorAll(".personality-item").forEach((btn) => {
      const isSelected = btn.dataset.id === active.id;
      btn.classList.toggle("active", isSelected);
      btn.setAttribute("aria-selected", isSelected ? "true" : "false");
    });
  }

  renderPersonalityDetail(active, total);
}

function renderPersonalities() {
  const el = document.getElementById("personality-list");
  if (!el || !personalitiesState.data) return;

  const { personalities, total } = personalitiesState.data;
  if (!personalities || !personalities.length) {
    el.innerHTML = "<p class='error'>No investor personalities available.</p>";
    return;
  }

  if (!personalitiesState.activeId || !personalities.some((p) => p.id === personalitiesState.activeId)) {
    personalitiesState.activeId = personalities[0].id;
  }

  const active = personalities.find((p) => p.id === personalitiesState.activeId) || personalities[0];
  if (personalityTableState.activePersonalityId !== active.id) {
    personalityTableState.activePersonalityId = active.id;
    personalityTableState.sectorFilter = "ALL";
    personalityTableState.sortColumn = "score";
    personalityTableState.sortDirection = "desc";
  }

  el.innerHTML = `
    <div class="personality-layout">
      <div class="personality-sidebar">
        <div class="personality-sidebar-header">
          <span>Investment Strategies</span>
          <span class="personality-badge">${personalities.length}</span>
        </div>
        <div id="personality-sidebar-list" class="personality-sidebar-list" role="tablist" aria-label="Investor Personalities">
          ${personalities
            .map(
              (p) => `
            <button class="personality-item ${p.id === active.id ? "active" : ""}" data-id="${p.id}" type="button" role="tab" aria-selected="${p.id === active.id ? "true" : "false"}">
              <div class="personality-item-info">
                <span class="personality-item-name">${p.name}</span>
                <span class="personality-item-desc">${p.description}</span>
              </div>
              <span class="personality-count">${p.matches}</span>
            </button>`,
            )
            .join("")}
        </div>
      </div>
      <div id="personality-detail-pane" class="personality-detail-pane card" role="tabpanel"></div>
    </div>`;

  renderPersonalityDetail(active, total);

  el.querySelectorAll(".personality-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (id && id !== personalitiesState.activeId) {
        selectPersonality(id);
      }
    });
  });
}

async function loadPersonalities() {
  const el = document.getElementById("personality-list");
  if (!el) return;
  if (personalitiesState.data) {
    renderPersonalities();
    return;
  }
  if (personalitiesState.loading) return;

  personalitiesState.loading = true;
  el.innerHTML = "<p class='hint'>Loading personalities (screening NIFTY 500 universe)…</p>";
  try {
    const res = await fetch("/api/personalities");
    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      throw new Error(errData?.error || `HTTP ${res.status}: Failed to load personalities`);
    }
    const data = await res.json();
    if (!data || !Array.isArray(data.personalities)) {
      throw new Error("Invalid response: personalities data missing");
    }
    personalitiesState.data = data;
    renderPersonalities();
  } catch (e) {
    el.innerHTML = `<p class="error">${e.message}</p><button class="btn" style="margin-top:0.5rem;" onclick="loadPersonalities()">Retry</button>`;
  } finally {
    personalitiesState.loading = false;
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
  if (!el) return;
  try {
    const res = await fetch("/api/journal");
    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      throw new Error(errData?.error || "Failed to load journal");
    }
    const data = await res.json();
    if (!data || !Array.isArray(data.entries) || !data.entries.length) {
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
  if (!el) return;
  el.innerHTML = "<p>Loading…</p>";
  try {
    const res = await fetch(`/api/news?symbol=${encodeURIComponent(symbol)}`);
    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      throw new Error(errData?.error || "Failed to load news");
    }
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) {
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

// Broker notices & OAuth
function showBrokerNotice(type, text) {
  const noticeEl = document.getElementById("broker-notice");
  if (!noticeEl) return;
  noticeEl.className = `broker-banner ${type}`;
  noticeEl.innerHTML = '<span class="broker-notice-text"></span><button type="button" class="btn btn-sm" style="margin-left:1rem;" onclick="this.parentElement.classList.add(\'hidden\')">✕</button>';
  const span = noticeEl.querySelector(".broker-notice-text");
  if (span) span.textContent = text;
  noticeEl.classList.remove("hidden");
}

function checkOAuthParams() {
  const params = new URLSearchParams(window.location.search);
  const brokerParam = params.get("broker");
  if (brokerParam === "connected") {
    showBrokerNotice("success", "Connected to Upstox successfully!");
    window.history.replaceState({}, document.title, window.location.pathname);
    document.querySelector('.tab-btn[data-tab="portfolio"]')?.click();
  } else if (brokerParam === "error") {
    const msg = params.get("message") || "Authorization failed";
    showBrokerNotice("error", `Upstox authorization error: ${msg}`);
    window.history.replaceState({}, document.title, window.location.pathname);
    document.querySelector('.tab-btn[data-tab="portfolio"]')?.click();
  }
}

// Broker status
async function loadBrokerStatus() {
  const el = document.getElementById("broker-status");
  if (!el) return;
  try {
    const res = await fetch("/api/broker");
    const b = await res.json();
    const authUrl = b.authUrl || "/api/broker";
    if (b.authenticated) {
      el.innerHTML = `
        <span class="positive">● Connected to Upstox</span>
        <button type="button" class="btn btn-sm btn-outline-danger" id="broker-disconnect-btn">Disconnect</button>
      `;
      document.getElementById("broker-disconnect-btn")?.addEventListener("click", async () => {
        if (!confirm("Are you sure you want to disconnect Upstox?")) return;
        try {
          await fetch("/api/broker/disconnect", { method: "POST" });
          showBrokerNotice("success", "Disconnected from Upstox.");
          loadBrokerStatus();
          loadPortfolio();
          loadOrders();
        } catch (e) {
          alert(`Failed to disconnect: ${e.message}`);
        }
      });
    } else {
      el.innerHTML = `<span class="negative">○ Not connected</span> <button class="btn" onclick="window.open('${authUrl}', '_self')">Authorize</button>`;
    }
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
    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      if (res.status === 401 || errData?.expired) {
        const brokerEl = document.getElementById("broker-status");
        if (brokerEl) {
          const authRes = await fetch("/api/broker").catch(() => null);
          const b = authRes ? await authRes.json() : {};
          const authUrl = b.authUrl || "/api/broker";
          brokerEl.innerHTML = `<span class="negative">○ Session expired</span> <button class="btn" onclick="window.open('${authUrl}', '_self')">Re-authorize</button>`;
        }
      }
      throw new Error(errData?.error || "Failed to load portfolio");
    }
    const data = await res.json();
    if (!data.holdings || data.holdings.length === 0) {
      el.innerHTML = "<p>No holdings found.</p>";
      return;
    }

    const totalValue = data.total ?? data.holdings.reduce((sum, h) => sum + (h.currentValue || 0), 0);
    const totalPnl = data.holdings.reduce((sum, h) => sum + (h.pnl || 0), 0);
    const totalCost = totalValue - totalPnl;
    const totalPnlPercent = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    const totalPnlCls = totalPnl >= 0 ? "positive" : "negative";

    const summaryHtml = `
      <div class="portfolio-summary">
        <div class="summary-card">
          <div class="label">Total Portfolio Value</div>
          <div class="value">${money(totalValue)}</div>
        </div>
        <div class="summary-card ${totalPnlCls}">
          <div class="label">Total Unrealized P&amp;L</div>
          <div class="value">${totalPnl >= 0 ? "+" : ""}${money(totalPnl)} (${totalPnlPercent.toFixed(2)}%)</div>
        </div>
        <div class="summary-card">
          <div class="label">Total Holdings</div>
          <div class="value">${data.holdings.length}</div>
        </div>
      </div>
    `;

    const rowsHtml = data.holdings
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
        const dayCls = (h.dayChangePercent ?? 0) >= 0 ? "positive" : "negative";
        const dayPercentFormatted = (h.dayChangePercent != null ? Number(h.dayChangePercent) : 0).toFixed(2);
        const reasons = h.recommendation?.reasons?.length
          ? h.recommendation.reasons.join(" · ")
          : "";

        return `<tr>
          <td class="symbol-col">
            <button type="button" class="symbol-btn" data-symbol="${h.symbol}" title="Click to trade ${h.symbol}">${h.symbol}</button>
          </td>
          <td><span class="badge ${recCls}">${action.replace("_", " ")}</span></td>
          <td class="num-col">${h.quantity}</td>
          <td class="num-col">${money(h.averagePrice)}</td>
          <td class="num-col">${money(h.ltp)}</td>
          <td class="num-col ${dayCls}">${(h.dayChangePercent ?? 0) >= 0 ? "+" : ""}${dayPercentFormatted}%</td>
          <td class="num-col ${pnlCls}">${h.pnl >= 0 ? "+" : ""}${money(h.pnl)} (${pnlPercentFormatted}%)</td>
          <td class="num-col">${money(h.currentValue)}</td>
          <td class="reasons-col">
            ${reasons ? `<details><summary>Rationale</summary><div class="reasons-text">${reasons}</div></details>` : "—"}
          </td>
        </tr>`;
      })
      .join("");

    el.innerHTML = `
      ${summaryHtml}
      <div class="table-container">
        <table class="holdings-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Signal</th>
              <th class="num-col">Qty</th>
              <th class="num-col">Avg Price</th>
              <th class="num-col">LTP</th>
              <th class="num-col">Day Chg</th>
              <th class="num-col">Total P&amp;L</th>
              <th class="num-col">Current Value</th>
              <th>Analysis</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;

    el.querySelectorAll(".symbol-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const symbol = btn.dataset.symbol;
        if (symbol) {
          navigateToTrade(symbol, "BUY");
        }
      });
    });
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

document.getElementById("trade-confirm")?.addEventListener("click", async (e) => {
  const confirmBtn = e.currentTarget;
  const originalText = confirmBtn.textContent;
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

  confirmBtn.disabled = true;
  confirmBtn.textContent = "Placing order...";

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
    document.getElementById("trade-symbol").value = "";
    document.getElementById("trade-qty").value = "";
    if (priceEl) priceEl.value = "";
    loadPortfolio();
    loadOrders();
  } catch (err) {
    alert(`Trade failed: ${err.message}`);
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = originalText;
  }
});

// Orders
async function loadOrders() {
  const el = document.getElementById("portfolio-orders");
  if (!el) return;
  try {
    const res = await fetch("/api/orders");
    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      if (res.status === 401 || errData?.expired) {
        const brokerEl = document.getElementById("broker-status");
        if (brokerEl) {
          const authRes = await fetch("/api/broker").catch(() => null);
          const b = authRes ? await authRes.json() : {};
          const authUrl = b.authUrl || "/api/broker";
          brokerEl.innerHTML = `<span class="negative">○ Session expired</span> <button class="btn" onclick="window.open('${authUrl}', '_self')">Re-authorize</button>`;
        }
      }
      throw new Error(errData?.error || "Failed to load orders");
    }
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
      ? '<p class="muted">Ollama detected — AI deep-dive available.</p>'
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
checkOAuthParams();
