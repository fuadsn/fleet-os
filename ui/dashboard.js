/* ═══════════════════════════════════════════════════════════════════
   Fleet Treasury OS — Dashboard Page Logic
   ═══════════════════════════════════════════════════════════════════ */

let briefingCache = {};

async function init() {
  // Inject navigation header
  document.getElementById('app-header').innerHTML = createNavHeader('dashboard');

  // Check API connection
  await checkConnection();

  // Load briefings for all operators
  briefingCache = await loadAllBriefings();

  // Render the operator cards and summary
  renderOperatorGrid();
  renderSummaryBar();
}

function renderOperatorGrid() {
  const grid = document.getElementById('operator-grid');

  let html = '';
  for (const [opId, meta] of Object.entries(OPERATORS)) {
    const b = briefingCache[opId] || {};
    const balance = formatLakhsShort(b.current_balance ?? 0);
    const burn = '\u20B9' + ((b.daily_burn_rate ?? 0) / 1000).toFixed(0) + 'K';
    const gapDetected = b.gap_detected;
    const gapDays = (b.days_to_next_inflow ?? 0).toFixed(0);

    html += `
      <a href="operator.html?id=${opId}" class="operator-card-large">
        <div class="op-card-header">
          <span class="op-card-name">${meta.name}</span>
          <span class="status-badge ${gapDetected ? 'gap' : 'healthy'}">
            ${gapDetected ? 'Gap Detected' : 'Healthy'}
          </span>
        </div>
        <div class="op-card-kpis">
          <div class="op-card-kpi">
            <div class="op-card-kpi-value">${balance}</div>
            <div class="op-card-kpi-label">Current Balance</div>
          </div>
          <div class="op-card-kpi">
            <div class="op-card-kpi-value">${burn}</div>
            <div class="op-card-kpi-label">Daily Burn Rate</div>
          </div>
          <div class="op-card-kpi">
            <div class="op-card-kpi-value">${b.active_vehicles ?? meta.vehicles}</div>
            <div class="op-card-kpi-label">Active Vehicles</div>
          </div>
          <div class="op-card-kpi">
            <div class="op-card-kpi-value">${gapDetected ? gapDays + 'd' : '\u2014'}</div>
            <div class="op-card-kpi-label">${gapDetected ? 'Gap In' : 'No Gap'}</div>
          </div>
        </div>
        <div class="op-card-footer">
          <span class="op-card-vehicles">${meta.vehicles} vehicles in fleet</span>
          <span class="op-card-cta">View Briefing &rarr;</span>
        </div>
      </a>`;
  }

  grid.innerHTML = html;
}

function renderSummaryBar() {
  const bar = document.getElementById('summary-bar');

  let totalVehicles = 0;
  let totalOperators = Object.keys(OPERATORS).length;
  let gapsDetected = 0;
  let healthyCount = 0;

  for (const [opId, meta] of Object.entries(OPERATORS)) {
    totalVehicles += meta.vehicles;
    const b = briefingCache[opId] || {};
    if (b.gap_detected) gapsDetected++;
    else healthyCount++;
  }

  bar.innerHTML = `
    <div class="summary-stat">
      <div class="summary-stat-value primary">${totalOperators}</div>
      <div class="summary-stat-label">Fleet Operators</div>
    </div>
    <div class="summary-stat">
      <div class="summary-stat-value tertiary">${totalVehicles}</div>
      <div class="summary-stat-label">Vehicles Monitored</div>
    </div>
    <div class="summary-stat">
      <div class="summary-stat-value ${gapsDetected > 0 ? 'error' : 'tertiary'}">${gapsDetected}</div>
      <div class="summary-stat-label">Gaps Detected</div>
    </div>
    <div class="summary-stat">
      <div class="summary-stat-value tertiary">${healthyCount}</div>
      <div class="summary-stat-label">Healthy</div>
    </div>`;
}

// Boot
init();
