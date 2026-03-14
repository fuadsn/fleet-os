/* ═══════════════════════════════════════════════════════════════════
   Fleet Treasury OS — Activity Log Page
   ═══════════════════════════════════════════════════════════════════ */

let currentFilter = 'all';

async function init() {
  document.getElementById('app-header').innerHTML = createNavHeader('activity');
  await checkConnection();
  setupFilters();
  await loadActivity();
  // Poll for new activity every 5 seconds
  setInterval(loadActivity, 5000);
}

function setupFilters() {
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      loadActivity();
    });
  });
}

async function loadActivity() {
  let runs = [];
  try {
    runs = await fetchJSON(`${API}/activity`);
  } catch { return; }

  // Apply filter
  if (currentFilter !== 'all') {
    runs = runs.filter(r => r.outcome === currentFilter);
  }

  const container = document.getElementById('activity-list');

  if (!runs.length) {
    const noResults = currentFilter !== 'all';
    container.innerHTML = `
      <div class="empty-state">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        <span class="empty-state-title">${noResults ? 'No Matching Runs' : 'No Agent Runs Yet'}</span>
        <span class="empty-state-text">${noResults
          ? 'No runs match this filter. Try "All Runs".'
          : 'Run an agent from an operator\'s briefing page to see activity here.'
        }</span>
      </div>`;
    return;
  }

  container.innerHTML = runs.map(run => renderRunCard(run)).join('');
}

function renderRunCard(run) {
  const ts = new Date(run.timestamp);
  const timeStr = ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = ts.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  const outcomeInfo = {
    disbursed:        { label: 'Disbursed',        cls: 'disbursed',  icon: '✓' },
    pending_approval: { label: 'Pending Review',   cls: 'pending',    icon: '⏳' },
    withheld:         { label: 'Credit Withheld',  cls: 'withheld',   icon: '✕' },
    healthy:          { label: 'No Action Needed',  cls: 'healthy',   icon: '✓' },
    rejected:         { label: 'Rejected',          cls: 'withheld',  icon: '✕' },
  };
  const oc = outcomeInfo[run.outcome] || { label: run.outcome, cls: '', icon: '?' };

  const causeLabel = {
    delayed_receivable: 'Delayed Receivable',
    demand_spike: 'Demand Spike',
    route_contraction: 'Route Contraction',
    insufficient_data: 'Insufficient Data',
  };

  const stepsHtml = run.steps.map(step => {
    const agentLabels = {
      gap_detector: 'Gap Detector',
      diagnosis_agent: 'Diagnosis Agent',
      credit_agent: 'Credit Agent',
      orchestrator: 'Orchestrator',
    };
    const agentColors = {
      gap_detector: 'var(--md-primary)',
      diagnosis_agent: 'var(--md-tertiary)',
      credit_agent: 'var(--md-primary-container)',
      orchestrator: 'var(--md-on-surface)',
    };
    return `
      <div class="activity-step">
        <div class="activity-step-agent" style="color:${agentColors[step.agent] || 'inherit'}">
          ${agentLabels[step.agent] || step.agent}
        </div>
        <div class="activity-step-action">${step.action}</div>
        ${step.detail ? `<div class="activity-step-detail">${step.detail}</div>` : ''}
      </div>`;
  }).join('');

  return `
    <div class="activity-card">
      <div class="activity-card-header">
        <div class="activity-card-left">
          <a href="operator.html?id=${run.operator_id}" class="activity-operator-name">${run.operator_name}</a>
          <div class="activity-meta">
            <span class="activity-run-id">${run.id}</span>
            <span class="activity-timestamp">${dateStr} at ${timeStr}</span>
            <span class="activity-duration">${run.duration_ms}ms</span>
          </div>
        </div>
        <div class="activity-card-right">
          <span class="status-badge ${oc.cls}">${oc.label}</span>
          ${run.tier ? `<span class="tier-badge">Tier ${run.tier}</span>` : ''}
        </div>
      </div>

      ${run.cause ? `
      <div class="activity-diagnosis-row">
        <span class="activity-cause">${causeLabel[run.cause] || run.cause}</span>
        ${run.confidence != null ? `
        <div class="confidence-bar-wrap">
          <div class="confidence-bar">
            <div class="confidence-fill" style="width:${(run.confidence * 100).toFixed(0)}%"></div>
          </div>
          <span class="confidence-label">${(run.confidence * 100).toFixed(0)}%</span>
        </div>` : ''}
        ${run.offer_amount ? `<span class="activity-offer">₹${(run.offer_amount / 100000).toFixed(2)}L offered</span>` : ''}
      </div>` : ''}

      <div class="activity-steps">
        <div class="activity-steps-title">Pipeline Steps</div>
        <div class="activity-steps-timeline">
          ${stepsHtml}
        </div>
      </div>
    </div>`;
}

// Boot
init();
