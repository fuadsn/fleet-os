/* ═══════════════════════════════════════════════════════════════════
   Fleet Treasury OS — Operator Detail Page
   Shows all underlying data for one fleet operator.
   ═══════════════════════════════════════════════════════════════════ */

let operatorId = null;
let offerId = null;

async function init() {
  document.getElementById('app-header').innerHTML = createNavHeader('detail');
  await checkConnection();

  const params = new URLSearchParams(window.location.search);
  operatorId = params.get('id');
  offerId = params.get('offer');  // set when coming from queue

  if (!operatorId || !OPERATORS[operatorId]) {
    document.getElementById('detail-content').innerHTML = `
      <div class="empty-state">
        <span class="empty-state-title">Operator Not Found</span>
        <a href="index.html" class="back-link" style="margin-top:16px;">Back to Dashboard</a>
      </div>`;
    return;
  }

  const meta = OPERATORS[operatorId];
  document.title = `${meta.name} — Detail — Fleet Treasury OS`;

  let detail = {};
  let briefing = {};
  try {
    [detail, briefing] = await Promise.all([
      fetchJSON(`${API}/fleet/${operatorId}/detail`),
      fetchJSON(`${API}/fleet/${operatorId}/briefing`),
    ]);
  } catch {}

  renderDetail(detail, briefing);
}

async function approveOffer() {
  if (!offerId) return;
  const btn = document.getElementById('approve-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Approving...'; }
  try {
    await fetch(`${API}/officer/approve/${offerId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    // Replace the action bar with success
    const bar = document.getElementById('offer-action-bar');
    if (bar) {
      bar.innerHTML = `
        <div class="offer-approved-msg">
          ${ICONS.check} Offer approved and disbursed. <a href="queue.html">Back to queue</a>
        </div>`;
    }
  } catch {
    if (btn) { btn.disabled = false; btn.textContent = 'Approve & Disburse →'; }
  }
}

async function rejectOffer() {
  if (!offerId) return;
  const btn = document.getElementById('reject-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Rejecting...'; }
  try {
    await fetch(`${API}/officer/reject/${offerId}`, { method: 'POST' });
    const bar = document.getElementById('offer-action-bar');
    if (bar) {
      bar.innerHTML = `
        <div class="offer-rejected-msg">
          Offer rejected. <a href="queue.html">Back to queue</a>
        </div>`;
    }
  } catch {
    if (btn) { btn.disabled = false; btn.textContent = 'Reject'; }
  }
}

function renderDetail(detail, briefing) {
  const container = document.getElementById('detail-content');
  const gapDetected = briefing.gap_detected;

  const offerBar = offerId ? `
    <div class="offer-action-bar" id="offer-action-bar">
      <div class="offer-action-info">
        <span class="offer-action-label">Pending Offer</span>
        <span class="offer-action-text">Review the data below, then approve or reject this credit offer.</span>
      </div>
      <div class="offer-action-buttons">
        <button class="btn-approve" id="approve-btn" onclick="approveOffer()">Approve &amp; Disburse &rarr;</button>
        <button class="btn-reject" id="reject-btn" onclick="rejectOffer()">Reject</button>
      </div>
    </div>` : '';

  container.innerHTML = `
    ${offerBar}
    <div class="detail-header">
      <div>
        <h1 class="operator-headline">${detail.name}</h1>
        <div class="detail-meta-row">
          <span class="detail-meta-chip">${detail.bank} Bank</span>
          <span class="detail-meta-chip">A/C ${detail.bank_account}</span>
          <span class="detail-meta-chip">${detail.num_vehicles} Vehicles</span>
          <span class="status-badge ${gapDetected ? 'gap' : 'healthy'}">${gapDetected ? 'Gap Detected' : 'Healthy'}</span>
        </div>
      </div>
    </div>

    <!-- Client Relationships -->
    <div class="detail-section">
      <h2 class="detail-section-title">Client Relationships</h2>
      <div class="client-grid">
        ${detail.client_details.map(c => `
          <div class="client-card">
            <div class="client-name">${c.name}</div>
            <div class="client-stats">
              <div class="client-stat">
                <div class="client-stat-val">${c.cycle_days}d</div>
                <div class="client-stat-lbl">Payment Cycle</div>
              </div>
              <div class="client-stat">
                <div class="client-stat-val ${c.avg_delay > 5 ? 'text-error' : ''}">${c.avg_delay}d</div>
                <div class="client-stat-lbl">Avg Delay</div>
              </div>
              <div class="client-stat">
                <div class="client-stat-val">${(c.reliability * 100).toFixed(0)}%</div>
                <div class="client-stat-lbl">Reliability</div>
              </div>
              <div class="client-stat">
                <div class="client-stat-val">${formatLakhsShort(c.expected_amount)}</div>
                <div class="client-stat-lbl">Expected</div>
              </div>
            </div>
            <div class="client-history">
              <span>${c.payments_received} payments received</span>
              <span>Total: ${formatLakhs(c.total_received)}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Route Distribution -->
    <div class="detail-section">
      <h2 class="detail-section-title">Route Distribution</h2>
      <div class="route-bars">
        ${Object.entries(detail.route_distribution).sort((a,b) => b[1] - a[1]).map(([route, count]) => {
          const pct = (count / detail.num_vehicles * 100).toFixed(0);
          return `
            <div class="route-bar-row">
              <span class="route-name">${route}</span>
              <div class="route-bar-track">
                <div class="route-bar-fill" style="width:${pct}%"></div>
              </div>
              <span class="route-count">${count} vehicles</span>
            </div>`;
        }).join('')}
      </div>
    </div>

    <!-- Daily Fuel Spend (last 14 days) -->
    <div class="detail-section">
      <h2 class="detail-section-title">Daily Fuel Spend (Last 14 Days)</h2>
      <div class="fuel-grid">
        ${Object.entries(detail.daily_fuel_last_14d).sort().map(([day, amount]) => {
          const d = new Date(day);
          const label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
          return `
            <div class="fuel-day">
              <div class="fuel-day-amount">${formatLakhsShort(amount)}</div>
              <div class="fuel-day-label">${label}</div>
            </div>`;
        }).join('')}
      </div>
      <div class="fuel-summary">
        Total fuel transactions: <strong>${detail.fuel_transactions_count}</strong> across ${detail.total_vehicles_registered} registered vehicles
      </div>
    </div>

    <!-- Recent Bank Transactions -->
    <div class="detail-section">
      <h2 class="detail-section-title">Recent Bank Transactions</h2>
      <div class="txn-table-wrap">
        <table class="txn-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Narration</th>
              <th>Type</th>
              <th class="txn-amount-col">Amount</th>
              <th class="txn-amount-col">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${detail.recent_bank_transactions.slice().reverse().map(t => `
              <tr>
                <td class="txn-date">${t.valueDate}</td>
                <td class="txn-narration">${t.narration}</td>
                <td><span class="txn-type-badge ${t.type === 'CREDIT' ? 'credit' : 'debit'}">${t.type}</span></td>
                <td class="txn-amount-col ${t.type === 'CREDIT' ? 'text-tertiary' : ''}">${t.type === 'CREDIT' ? '+' : '-'}${formatLakhs(t.amount)}</td>
                <td class="txn-amount-col">${formatLakhs(Math.abs(t.currentBalance))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// Boot
init();
