/* ═══════════════════════════════════════════════════════════════════
   Fleet Treasury OS — Operator Detail Page Logic
   ═══════════════════════════════════════════════════════════════════ */

let cashChart = null;
let operatorId = null;

async function init() {
  // Inject navigation header
  document.getElementById('app-header').innerHTML = createNavHeader('operator');

  // Check API connection
  await checkConnection();

  // Get operator ID from URL
  operatorId = new URLSearchParams(window.location.search).get('id');

  if (!operatorId || !OPERATORS[operatorId]) {
    document.getElementById('operator-content').innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span class="empty-state-title">Operator Not Found</span>
        <span class="empty-state-text">The requested operator ID "${operatorId || ''}" was not found.</span>
        <a href="index.html" class="back-link" style="margin-top:16px;">Back to Dashboard</a>
      </div>`;
    return;
  }

  // Set page title
  const meta = OPERATORS[operatorId];
  document.title = `${meta.name} — Fleet Treasury OS`;

  // Load briefing
  let briefing = {};
  try {
    briefing = await fetchJSON(`${API}/fleet/${operatorId}/briefing`);
  } catch {}

  renderOperatorDetail(operatorId, meta, briefing);
  // Wait a frame so the canvas has layout dimensions before Chart.js reads them
  requestAnimationFrame(() => {
    renderCashFlowChart(operatorId, briefing);
  });
}

function renderOperatorDetail(opId, meta, briefing) {
  const gapDetected = briefing.gap_detected;
  const balanceFormatted = ((briefing.current_balance ?? 0) / 100000).toFixed(2);
  const burnFormatted = ((briefing.daily_burn_rate ?? 0) / 1000).toFixed(0);
  const gapDays = (briefing.days_to_next_inflow ?? 0).toFixed(0);
  const deficitFormatted = ((briefing.projected_deficit ?? 0) / 100000).toFixed(2);

  const container = document.getElementById('operator-content');
  container.innerHTML = `
    <h1 class="operator-headline">${meta.name}</h1>
    <p class="operator-sub">Treasury Briefing &mdash; ${meta.vehicles} Vehicles</p>

    <div class="hero-kpis">
      <div class="hero-kpi highlight">
        <div class="hero-kpi-number">\u20B9${balanceFormatted}L</div>
        <div class="hero-kpi-label">Current Balance</div>
      </div>
      <div class="hero-kpi">
        <div class="hero-kpi-number">\u20B9${burnFormatted}K</div>
        <div class="hero-kpi-label">Daily Burn Rate</div>
      </div>
      <div class="hero-kpi">
        <div class="hero-kpi-number">${briefing.active_vehicles ?? '\u2014'}</div>
        <div class="hero-kpi-label">Active Vehicles</div>
      </div>
      <div class="hero-kpi ${gapDetected ? 'error-state' : 'healthy-state'}">
        <div class="hero-kpi-number">${gapDetected ? gapDays + 'd' : 'OK'}</div>
        <div class="hero-kpi-label">${gapDetected ? 'Gap Detected' : 'Healthy'}</div>
      </div>
    </div>

    ${gapDetected ? `
    <div class="extra-kpis">
      <div class="extra-kpi deficit">
        <div class="hero-kpi-number">\u20B9${deficitFormatted}L</div>
        <div class="hero-kpi-label">Projected Deficit</div>
      </div>
      <div class="extra-kpi inflow">
        <div class="hero-kpi-number">\u20B9${((briefing.next_inflow_amount ?? 0) / 100000).toFixed(1)}L</div>
        <div class="hero-kpi-label">Next Inflow</div>
      </div>
    </div>` : ''}

    <div class="chart-card">
      <div class="chart-card-header">
        <div class="chart-card-title">30-Day Cash Flow Projection</div>
        <div class="chart-legend">
          <span class="chart-legend-item"><span class="legend-line without"></span>Without Disbursement</span>
          <span class="chart-legend-item"><span class="legend-line with"></span>With Disbursement</span>
        </div>
      </div>
      <div class="chart-wrap">
        <canvas id="cashChart"></canvas>
      </div>
    </div>

    <button class="run-btn" onclick="runAgent()" id="run-btn">
      ${ICONS.robot} Run Agent Pipeline
    </button>

    <div class="trace-section-title">Agent Reasoning Trace</div>
    <div class="trace-container" id="trace-container">
      <div class="trace-placeholder">
        ${ICONS.robot}
        <span>Click "Run Agent Pipeline" to start the AI analysis...</span>
      </div>
    </div>

    <div id="outcome-container"></div>
  `;
}

// ── Cash Flow Chart (Chart.js) — Before/After Disbursement ──────────

function renderCashFlowChart(opId, briefing) {
  const canvas = document.getElementById('cashChart');
  if (!canvas) return;

  if (cashChart) { cashChart.destroy(); cashChart = null; }

  const ctx = canvas.getContext('2d');
  const days = 30;
  const labels = [];
  const burnRate = briefing.daily_burn_rate ?? 150000;
  const inflowDay = Math.round(briefing.days_to_next_inflow ?? 15);
  const inflowAmount = briefing.next_inflow_amount ?? burnRate * 10;

  // Use a realistic starting balance for the projection
  // (absolute value scaled down to show the gap story clearly)
  const startBalance = Math.abs(briefing.current_balance ?? 500000) > 1000000
    ? burnRate * 8  // ~8 days of runway if balance is deeply negative
    : Math.abs(briefing.current_balance);

  // Compute the gap amount the agent would disburse
  const gapAmount = briefing.projected_deficit > 0
    ? Math.round(briefing.projected_deficit / 100) * 100
    : burnRate * 5;
  // Disburse a few days before the gap hits
  const disburseDay = Math.max(Math.floor(startBalance / burnRate) - 1, 2);

  // --- WITHOUT disbursement ---
  const withoutData = [];
  let balWithout = startBalance;
  for (let i = 0; i <= days; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    labels.push(d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }));
    if (i > 0) balWithout -= burnRate;
    if (i === inflowDay) balWithout += inflowAmount;
    withoutData.push(balWithout);
  }

  // --- WITH disbursement ---
  const withData = [];
  let balWith = startBalance;
  for (let i = 0; i <= days; i++) {
    if (i > 0) balWith -= burnRate;
    if (i === disburseDay) balWith += gapAmount;  // agent disburses
    if (i === inflowDay) balWith += inflowAmount;
    withData.push(balWith);
  }

  // Find where the "without" line hits zero
  const gapIndex = withoutData.findIndex(v => v <= 0);

  // Clamp for display
  const withoutDisplay = withoutData.map(v => Math.max(v, 0));
  const withDisplay = withData.map(v => Math.max(v, 0));

  // Gradients
  const chartHeight = canvas.parentElement.clientHeight || 260;

  const gradientWith = ctx.createLinearGradient(0, 0, 0, chartHeight);
  gradientWith.addColorStop(0, 'rgba(54, 204, 139, 0.2)');
  gradientWith.addColorStop(1, 'rgba(54, 204, 139, 0.0)');

  const gradientWithout = ctx.createLinearGradient(0, 0, 0, chartHeight);
  gradientWithout.addColorStop(0, 'rgba(199, 80, 80, 0.08)');
  gradientWithout.addColorStop(1, 'rgba(199, 80, 80, 0.0)');

  // Point styling for "without" line — mark the gap point
  const withoutPointRadii = withoutDisplay.map((_, i) => i === gapIndex ? 7 : 0);
  const withoutPointColors = withoutDisplay.map((_, i) =>
    i === gapIndex ? '#C75050' : 'transparent'
  );

  // Point styling for "with" line — mark the disbursement point
  const withPointRadii = withDisplay.map((_, i) => i === disburseDay ? 7 : 0);
  const withPointColors = withDisplay.map((_, i) =>
    i === disburseDay ? '#36cc8b' : 'transparent'
  );

  // Custom crosshair + highlight plugin
  const crosshairPlugin = {
    id: 'crosshair',
    afterDraw(chart) {
      if (chart.tooltip?._active?.length) {
        const x = chart.tooltip._active[0].element.x;
        const yAxis = chart.scales.y;
        const ctx = chart.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, yAxis.top);
        ctx.lineTo(x, yAxis.bottom);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(0, 86, 86, 0.15)';
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.restore();
      }
    }
  };

  // Annotate key points with labels
  const annotationPlugin = {
    id: 'pointLabels',
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      ctx.save();
      ctx.font = '600 10px Roboto, sans-serif';
      ctx.textAlign = 'center';

      // Label the gap point (without line)
      if (gapIndex >= 0) {
        const meta0 = chart.getDatasetMeta(0);
        const pt = meta0.data[gapIndex];
        if (pt) {
          ctx.fillStyle = '#C75050';
          ctx.fillText('TRUCKS STOP', pt.x, pt.y - 16);
        }
      }

      // Label the disbursement point (with line)
      const meta1 = chart.getDatasetMeta(1);
      const dpt = meta1.data[disburseDay];
      if (dpt) {
        ctx.fillStyle = '#36cc8b';
        ctx.fillText('AGENT DISBURSES', dpt.x, dpt.y - 16);
      }

      ctx.restore();
    }
  };

  cashChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Without Disbursement',
          data: withoutDisplay,
          borderColor: '#C75050',
          backgroundColor: gradientWithout,
          borderWidth: 2,
          borderDash: [6, 4],
          tension: 0.35,
          fill: true,
          pointRadius: withoutPointRadii,
          pointBackgroundColor: withoutPointColors,
          pointBorderColor: withoutDisplay.map((_, i) => i === gapIndex ? '#fff' : 'transparent'),
          pointBorderWidth: 3,
          pointHoverRadius: 8,
          pointHoverBackgroundColor: '#C75050',
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 3,
        },
        {
          label: 'With Disbursement',
          data: withDisplay,
          borderColor: '#36cc8b',
          backgroundColor: gradientWith,
          borderWidth: 2.5,
          tension: 0.35,
          fill: true,
          pointRadius: withPointRadii,
          pointBackgroundColor: withPointColors,
          pointBorderColor: withDisplay.map((_, i) => i === disburseDay ? '#fff' : 'transparent'),
          pointBorderWidth: 3,
          pointHoverRadius: 8,
          pointHoverBackgroundColor: '#36cc8b',
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 3,
        },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: { top: 30, right: 16, bottom: 16, left: 8 }
      },
      interaction: {
        intersect: false,
        mode: 'index',
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: '#003434',
          titleColor: 'rgba(255,255,255,0.6)',
          titleFont: { family: "'Roboto', sans-serif", weight: '500', size: 11 },
          bodyFont: { family: "'Roboto Mono', monospace", size: 12, weight: '500' },
          bodyColor: '#fff',
          footerFont: { family: "'Roboto Mono', monospace", size: 11, weight: '700' },
          footerColor: '#d0f255',
          cornerRadius: 14,
          padding: { top: 12, right: 16, bottom: 12, left: 16 },
          boxPadding: 6,
          usePointStyle: true,
          pointStyleWidth: 10,
          displayColors: true,
          borderColor: 'rgba(54, 204, 139, 0.2)',
          borderWidth: 1,
          callbacks: {
            title: function(items) {
              return items[0].label;
            },
            label: function(context) {
              const val = context.parsed.y;
              const formatted = '\u20B9' + (val / 100000).toFixed(2) + 'L';
              const label = context.datasetIndex === 0 ? 'Without' : 'With   ';
              return label + '  ' + formatted;
            },
            footer: function(items) {
              if (items.length === 2) {
                const diff = items[1].parsed.y - items[0].parsed.y;
                if (diff > 0) {
                  return 'Saved    \u20B9' + (diff / 100000).toFixed(2) + 'L';
                }
              }
              return '';
            },
            labelColor: function(context) {
              return {
                borderColor: context.datasetIndex === 0 ? '#C75050' : '#36cc8b',
                backgroundColor: context.datasetIndex === 0 ? '#C75050' : '#36cc8b',
                borderRadius: 4,
              };
            }
          }
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#6f7975',
            font: { size: 10, family: "'Roboto', sans-serif" },
            maxRotation: 0,
            maxTicksLimit: 8,
            padding: 8,
          },
          grid: {
            color: 'rgba(111, 121, 117, 0.06)',
            drawBorder: false,
          },
          border: { display: false }
        },
        y: {
          ticks: {
            color: '#6f7975',
            font: { size: 10, family: "'Roboto', sans-serif" },
            callback: v => '\u20B9' + (v / 100000).toFixed(1) + 'L',
            padding: 8,
          },
          grid: {
            color: 'rgba(111, 121, 117, 0.06)',
            drawBorder: false,
          },
          border: { display: false },
          beginAtZero: true,
        }
      }
    },
    plugins: [crosshairPlugin, annotationPlugin]
  });
}

// ── Run Agent ───────────────────────────────────────────────────────

async function runAgent() {
  const opId = operatorId;
  const btn   = document.getElementById('run-btn');
  const trace = document.getElementById('trace-container');
  if (!btn || !trace) return;

  btn.disabled = true;
  btn.classList.add('running');
  btn.innerHTML = `${ICONS.robot} Running Pipeline...`;
  trace.innerHTML = '';

  const steps = [
    { text: 'Pulling XTRAPOWER fuel transactions...',            delay: 400  },
    { text: 'Pulling Setu AA bank statement...',                 delay: 800  },
    { text: 'Computing daily burn rate (7-day rolling avg)...',  delay: 600  },
    { text: 'Projecting 30-day cash position...',                delay: 500  },
  ];

  for (const s of steps) {
    await addTraceStep(trace, s.text, 'neutral', s.delay);
  }

  let result = {};
  try {
    const r = await fetch(`${API}/fleet/${opId}/run`, { method: 'POST' });
    result  = await r.json();
  } catch (e) {
    addTraceStep(trace, `Error: ${e.message}`, 'warning', 0);
    btn.disabled = false;
    btn.classList.remove('running');
    btn.innerHTML = `${ICONS.robot} Run Agent Pipeline`;
    return;
  }

  const gap     = result.gap_result ?? {};
  const diag    = result.diagnosis ?? {};
  const offer   = result.offer ?? {};
  const outcome = result.outcome ?? {};

  if (gap.gap_detected) {
    await addTraceStep(trace,
      `Gap detected: \u20B9${((gap.projected_deficit ?? 0) / 100000).toFixed(2)}L deficit in ${(gap.days_to_next_inflow ?? 0).toFixed(0)} days`,
      'warning', 500);
  } else {
    await addTraceStep(trace, 'No cash gap detected \u2014 operator is healthy', 'highlight', 500);
  }

  if (diag.cause) {
    await addTraceStep(trace, 'Analyzing transaction pattern (last 45 days)...', 'neutral', 700);
    await addTraceStep(trace,
      `Cause classified: ${diag.cause} (confidence: ${((diag.confidence ?? 0) * 100).toFixed(0)}%)`,
      diag.confidence > 0.75 ? 'highlight' : 'warning', 600);

    if (diag.evidence?.length) {
      for (const ev of diag.evidence) {
        await addTraceStep(trace, `  Evidence: ${ev}`, 'neutral', 300);
      }
    }

    await addTraceStep(trace, `Tiered autonomy decision: Tier ${diag.recommended_tier}`, 'neutral', 400);
  }

  if (offer.offer_id) {
    await addTraceStep(trace,
      `Generating offer: \u20B9${((offer.amount ?? 0) / 100000).toFixed(2)}L | ${offer.tenor_days} days | cost \u20B9${(offer.total_cost ?? 0).toFixed(0)}`,
      'neutral', 600);
  }

  if (outcome.status === 'disbursed') {
    await addTraceStep(trace, 'Auto-disbursing via Pine Labs Plural...', 'neutral', 800);
    await addTraceStep(trace, `Disbursed \u2014 TXN: ${outcome.txn_id}`, 'highlight', 400);
  } else if (outcome.status === 'pending_approval') {
    await addTraceStep(trace, 'Queued for officer review (Tier 2)', 'warning', 400);
  } else if (outcome.status === 'withheld') {
    await addTraceStep(trace, 'Credit withheld \u2014 health alert raised (Tier 3)', 'warning', 400);
  } else if (outcome.status === 'healthy') {
    await addTraceStep(trace, 'No action needed \u2014 operator cash flow positive', 'highlight', 400);
  }

  renderOutcome(outcome, offer, diag);

  btn.disabled = false;
  btn.classList.remove('running');
  btn.innerHTML = `${ICONS.robot} Run Agent Again`;
}

function addTraceStep(container, text, type, delay) {
  return new Promise(resolve => {
    setTimeout(() => {
      const step = document.createElement('div');
      step.className = 'trace-step';
      step.innerHTML = `<span class="arrow">\u2192</span><span class="${type}">${text}</span>`;
      container.appendChild(step);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => step.classList.add('visible'));
      });
      container.scrollTop = container.scrollHeight;
      resolve();
    }, delay);
  });
}

// ── Outcome Card ────────────────────────────────────────────────────

function renderOutcome(outcome, offer, diag) {
  const container = document.getElementById('outcome-container');
  if (!container) return;

  const statusMap = {
    disbursed:        { label: 'Auto-Disbursed',    cls: 'disbursed', icon: ICONS.check },
    pending_approval: { label: 'Pending Approval',  cls: 'pending',   icon: ICONS.alert },
    withheld:         { label: 'Credit Withheld',   cls: 'withheld',  icon: ICONS.alert },
    healthy:          { label: 'No Action Needed',  cls: 'disbursed', icon: ICONS.check },
  };

  const s = statusMap[outcome.status] ?? { label: outcome.status, cls: '', icon: '' };

  const showQueueBtn = outcome.status === 'pending_approval';
  const showDetailBtn = outcome.status !== 'healthy';

  container.innerHTML = `
    <div class="outcome-card ${s.cls}">
      <div class="outcome-title">${s.icon} ${s.label}</div>
      <div class="outcome-detail">
        ${offer.amount ? `Amount: \u20B9${(offer.amount / 100000).toFixed(2)}L for ${offer.tenor_days} days<br>` : ''}
        ${offer.total_cost ? `Cost to operator: \u20B9${offer.total_cost.toFixed(0)}<br>` : ''}
        ${offer.pine_spread ? `Pine Labs revenue: \u20B9${offer.pine_spread.toFixed(0)}<br>` : ''}
        ${diag.reasoning ? `<br>${diag.reasoning}` : ''}
        ${outcome.txn_id ? `<br><br>TXN: ${outcome.txn_id}` : ''}
      </div>
      <div class="outcome-actions">
        ${showQueueBtn ? `<a href="queue.html" class="btn-primary">Go to Review Queue &rarr;</a>` : ''}
        ${showDetailBtn ? `<a href="detail.html?id=${operatorId}" class="btn-secondary">View Operator Data</a>` : ''}
      </div>
    </div>`;
}

// Boot
init();
