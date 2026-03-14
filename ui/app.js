const API = 'http://localhost:8000';
let activeOperator = null;
let cashChart = null;

const OPERATORS = {
  'OP-SHARMA-001': { name: 'Sharma Logistics',    vehicles: 40 },
  'OP-VERMA-002':  { name: 'Verma Transport',     vehicles: 22 },
  'OP-GUPTA-003':  { name: 'Gupta Fleet Services',vehicles: 31 },
};

// -- Startup ----------------------------------------------------------------

async function init() {
  try {
    const r = await fetch(`${API}/`);
    if (r.ok) document.getElementById('server-status').textContent = '● API connected';
  } catch {
    document.getElementById('server-status').textContent = '● API offline — check uvicorn';
    document.getElementById('server-status').style.color = '#f85149';
  }

  await renderOperatorList();
  await refreshQueue();
  setInterval(refreshQueue, 8000);
}

// -- Operator List ----------------------------------------------------------

async function renderOperatorList() {
  const container = document.getElementById('operator-list');
  container.innerHTML = '';

  for (const [opId, meta] of Object.entries(OPERATORS)) {
    let briefing = {};
    try {
      const r = await fetch(`${API}/fleet/${opId}/briefing`);
      briefing = await r.json();
    } catch {}

    const gapDays  = briefing.days_to_next_inflow?.toFixed(0) ?? '—';
    const balance  = briefing.current_balance
      ? '₹' + (briefing.current_balance / 100000).toFixed(1) + 'L'
      : '—';
    const gapClass = briefing.gap_detected ? 'red' : 'green';
    const dotClass = briefing.gap_detected ? 'dot-red' : 'dot-green';

    const card = document.createElement('div');
    card.className = 'operator-card';
    card.id = `op-card-${opId}`;
    card.innerHTML = `
      <div class="op-name">
        <span class="status-dot ${dotClass}"></span>
        ${meta.name}
      </div>
      <div class="op-meta">${meta.vehicles} vehicles</div>
      <div class="op-kpis">
        <div class="kpi">
          <div class="kpi-val">${balance}</div>
          <div class="kpi-lbl">Balance</div>
        </div>
        <div class="kpi">
          <div class="kpi-val ${gapClass}">
            ${briefing.gap_detected ? `${gapDays}d` : 'Healthy'}
          </div>
          <div class="kpi-lbl">${briefing.gap_detected ? 'Gap in' : 'Status'}</div>
        </div>
      </div>`;
    card.onclick = () => selectOperator(opId);
    container.appendChild(card);
  }
}

// -- Select Operator -> Show Briefing ---------------------------------------

async function selectOperator(opId) {
  activeOperator = opId;

  document.querySelectorAll('.operator-card').forEach(c => c.classList.remove('active'));
  document.getElementById(`op-card-${opId}`)?.classList.add('active');

  let briefing = {};
  try {
    const r = await fetch(`${API}/fleet/${opId}/briefing`);
    briefing = await r.json();
  } catch {}

  const meta = OPERATORS[opId];

  document.getElementById('center-content').innerHTML = `
    <div class="section-title">${meta.name} — Treasury Briefing</div>

    <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:20px">
      <div class="kpi" style="background:#161b22; border:1px solid #21262d; border-radius:8px; padding:12px">
        <div class="kpi-val" style="font-size:18px">
          ₹${((briefing.current_balance ?? 0)/100000).toFixed(2)}L
        </div>
        <div class="kpi-lbl">Current Balance</div>
      </div>
      <div class="kpi" style="background:#161b22; border:1px solid #21262d; border-radius:8px; padding:12px">
        <div class="kpi-val ${briefing.gap_detected ? 'red' : 'green'}" style="font-size:18px">
          ${briefing.gap_detected
            ? `Gap in ${(briefing.days_to_next_inflow??0).toFixed(0)}d`
            : 'Healthy'}
        </div>
        <div class="kpi-lbl">Cash Position</div>
      </div>
      <div class="kpi" style="background:#161b22; border:1px solid #21262d; border-radius:8px; padding:12px">
        <div class="kpi-val" style="font-size:18px">${briefing.active_vehicles ?? '—'}</div>
        <div class="kpi-lbl">Active Vehicles</div>
      </div>
    </div>

    <div class="chart-wrap">
      <canvas id="cashChart"></canvas>
    </div>

    <button class="run-btn" onclick="runAgent('${opId}')" id="run-btn-${opId}">
      ▶ Run Agent for ${meta.name}
    </button>

    <div class="panel-title" style="margin-top:4px">Agent Reasoning Trace</div>
    <div class="trace-container" id="trace-${opId}">
      <div style="color:#8b949e; font-size:12px">Click Run Agent to start...</div>
    </div>

    <div id="outcome-${opId}"></div>
  `;

  renderCashFlowChart(opId, briefing);
}

// -- Cash Flow Chart --------------------------------------------------------

function renderCashFlowChart(opId, briefing) {
  const canvas = document.getElementById('cashChart');
  if (!canvas) return;

  if (cashChart) { cashChart.destroy(); cashChart = null; }

  const days    = 30;
  const labels  = [];
  const balance = [];
  const burnRate = briefing.daily_burn_rate ?? 5000;
  let   bal      = briefing.current_balance ?? 500000;

  // Project 30 days forward: daily burn, plus a single inflow spike
  const inflow_day = Math.round(briefing.days_to_next_inflow ?? 15);

  for (let i = 0; i <= days; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    labels.push(d.toLocaleDateString('en-IN', { month:'short', day:'numeric' }));

    bal -= burnRate;
    if (i === inflow_day) bal += (briefing.next_inflow_amount ?? burnRate * 20);
    balance.push(Math.max(bal, 0));
  }

  const gapIndex  = balance.findIndex(v => v <= 0);
  const pointColors = balance.map((_, i) =>
    i === gapIndex ? '#f85149' : 'transparent'
  );

  cashChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label:           'Projected Cash Balance',
        data:            balance,
        borderColor:     balance.some(v => v <= 0) ? '#f85149' : '#3fb950',
        backgroundColor: 'transparent',
        tension:         0.3,
        pointRadius:     pointColors.map(c => c === 'transparent' ? 0 : 6),
        pointBackgroundColor: pointColors,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#8b949e', font: { size: 10 } },
             grid:  { color: '#21262d' } },
        y: { ticks: { color: '#8b949e', font: { size: 10 },
                      callback: v => '₹' + (v/100000).toFixed(1) + 'L' },
             grid:  { color: '#21262d' } }
      }
    }
  });
}

// -- Run Agent --------------------------------------------------------------

async function runAgent(opId) {
  const btn   = document.getElementById(`run-btn-${opId}`);
  const trace = document.getElementById(`trace-${opId}`);
  if (!btn || !trace) return;

  btn.disabled    = true;
  btn.textContent = 'Running agent...';
  trace.innerHTML = '';

  const steps = [
    { text: 'Pulling XTRAPOWER fuel transactions...',         delay: 400  },
    { text: 'Pulling Setu AA bank statement...',              delay: 800  },
    { text: 'Computing daily burn rate (7-day rolling avg)...', delay: 600 },
    { text: 'Projecting 30-day cash position...',             delay: 500  },
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
    btn.textContent = '▶ Run Agent';
    return;
  }

  const gap = result.gap_result ?? {};
  const diag = result.diagnosis ?? {};
  const offer = result.offer ?? {};
  const outcome = result.outcome ?? {};

  if (gap.gap_detected) {
    await addTraceStep(trace,
      `Gap detected: ₹${((gap.projected_deficit??0)/100000).toFixed(2)}L deficit in ${(gap.days_to_next_inflow??0).toFixed(0)} days`,
      'warning', 500);
  } else {
    await addTraceStep(trace, 'No cash gap detected — operator is healthy', 'highlight', 500);
  }

  if (diag.cause) {
    await addTraceStep(trace, `Analyzing transaction pattern (last 45 days)...`, 'neutral', 700);
    await addTraceStep(trace,
      `Cause classified: ${diag.cause} (confidence: ${((diag.confidence??0)*100).toFixed(0)}%)`,
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
      `Generating offer: ₹${((offer.amount??0)/100000).toFixed(2)}L | ${offer.tenor_days} days | cost ₹${(offer.total_cost??0).toFixed(0)}`,
      'neutral', 600);
  }

  if (outcome.status === 'disbursed') {
    await addTraceStep(trace, `Auto-disbursing via Pine Labs Plural...`, 'neutral', 800);
    await addTraceStep(trace, `✓ Disbursed — TXN: ${outcome.txn_id}`, 'highlight', 400);
  } else if (outcome.status === 'pending_approval') {
    await addTraceStep(trace, `→ Queued for officer review (Tier 2)`, 'warning', 400);
  } else if (outcome.status === 'withheld') {
    await addTraceStep(trace, `✗ Credit withheld — health alert raised (Tier 3)`, 'warning', 400);
  } else if (outcome.status === 'healthy') {
    await addTraceStep(trace, `No action needed — operator cash flow positive`, 'highlight', 400);
  }

  renderOutcome(opId, outcome, offer, diag);
  await refreshQueue();
  await refreshAudit(opId);

  btn.disabled    = false;
  btn.textContent = '▶ Run Agent Again';
}

function addTraceStep(container, text, type, delay) {
  return new Promise(resolve => {
    setTimeout(() => {
      const step = document.createElement('div');
      step.className = `trace-step`;
      step.innerHTML = `<span class="arrow">→</span><span class="${type}">${text}</span>`;
      container.appendChild(step);
      requestAnimationFrame(() => step.classList.add('visible'));
      container.scrollTop = container.scrollHeight;
      resolve();
    }, delay);
  });
}

// -- Outcome Card -----------------------------------------------------------

function renderOutcome(opId, outcome, offer, diag) {
  const container = document.getElementById(`outcome-${opId}`);
  if (!container) return;

  const statusMap = {
    disbursed:        { label: '✓ AUTO-DISBURSED',   cls: 'disbursed' },
    pending_approval: { label: '⏳ PENDING APPROVAL', cls: 'pending'   },
    withheld:         { label: '✗ CREDIT WITHHELD',  cls: 'withheld'  },
    healthy:          { label: '✓ NO ACTION NEEDED', cls: 'disbursed' },
  };

  const s = statusMap[outcome.status] ?? { label: outcome.status, cls: '' };

  container.innerHTML = `
    <div class="outcome-card ${s.cls}">
      <div class="outcome-title">${s.label}</div>
      <div class="outcome-detail">
        ${offer.amount ? `Amount: ₹${(offer.amount/100000).toFixed(2)}L for ${offer.tenor_days} days<br>` : ''}
        ${offer.total_cost ? `Cost to operator: ₹${offer.total_cost.toFixed(0)}<br>` : ''}
        ${offer.pine_spread ? `Pine Labs revenue: ₹${offer.pine_spread.toFixed(0)}<br>` : ''}
        ${diag.reasoning ? `<br>${diag.reasoning}` : ''}
        ${outcome.txn_id ? `<br><br>TXN: ${outcome.txn_id}` : ''}
      </div>
    </div>`;
}

// -- Officer Queue ----------------------------------------------------------

async function refreshQueue() {
  let queue = [];
  try {
    const r = await fetch(`${API}/officer/queue`);
    queue   = await r.json();
  } catch { return; }

  const container = document.getElementById('officer-queue');

  if (!queue.length) {
    container.innerHTML = '<div class="empty-state">No pending approvals</div>';
    return;
  }

  container.innerHTML = queue.map(offer => `
    <div class="queue-card" id="queue-${offer.offer_id}">
      <div class="queue-title">
        ${OPERATORS[offer.operator_id]?.name ?? offer.operator_id}
      </div>
      <div class="queue-meta">
        Amount: ₹${(offer.amount/100000).toFixed(2)}L<br>
        Tenor: ${offer.tenor_days} days<br>
        Confidence: ${((offer.confidence??0)*100).toFixed(0)}%<br>
        Cause: ${offer.cause}<br>
        <em style="color:#6e7681">${offer.reasoning?.substring(0,80)}...</em>
      </div>
      <div class="btn-row">
        <button class="btn-approve" onclick="approveOffer('${offer.offer_id}')">
          Approve
        </button>
        <button class="btn-reject" onclick="rejectOffer('${offer.offer_id}')">
          Reject
        </button>
      </div>
    </div>`).join('');
}

async function approveOffer(offerId) {
  await fetch(`${API}/officer/approve/${offerId}`, { method: 'POST',
    headers: {'Content-Type':'application/json'}, body: '{}' });
  await refreshQueue();
}

async function rejectOffer(offerId) {
  await fetch(`${API}/officer/reject/${offerId}`, { method: 'POST' });
  await refreshQueue();
}

// -- Audit Log --------------------------------------------------------------

async function refreshAudit(opId) {
  let log = [];
  try {
    const r = await fetch(`${API}/fleet/${opId}/audit`);
    log = await r.json();
  } catch { return; }

  const container = document.getElementById('audit-log');
  if (!log.length) return;

  container.innerHTML = log.slice(-8).reverse().map(entry => `
    <div class="audit-item">
      ${entry.action} — ${entry.operator_id ?? ''}
      ${entry.txn_id ? `| ${entry.txn_id}` : ''}
      ${entry.confidence ? `| conf: ${((entry.confidence)*100).toFixed(0)}%` : ''}
    </div>`).join('');
}

// -- Boot -------------------------------------------------------------------
init();
