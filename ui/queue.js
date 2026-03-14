/* ═══════════════════════════════════════════════════════════════════
   Fleet Treasury OS — Officer Review Queue Page Logic
   ═══════════════════════════════════════════════════════════════════ */

let refreshInterval = null;

async function init() {
  // Inject navigation header
  document.getElementById('app-header').innerHTML = createNavHeader('queue');

  // Check API connection
  await checkConnection();

  // Initial load
  await refreshQueue();

  // Auto-refresh every 5 seconds
  refreshInterval = setInterval(refreshQueue, 5000);
}

async function refreshQueue() {
  let queue = [];
  try {
    const r = await fetch(`${API}/officer/queue`);
    queue = await r.json();
  } catch {
    return;
  }

  const container = document.getElementById('queue-container');

  if (!queue.length) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        <span class="empty-state-title">All Clear</span>
        <span class="empty-state-text">No pending approvals right now. The AI agent will queue offers here when they need officer review.</span>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="queue-grid">
      ${queue.map(offer => {
        const conf = offer.confidence ?? 0;
        const confPct = (conf * 100).toFixed(0);
        const isLowConf = conf < 0.75;
        const approveLabel = isLowConf ? 'Review &amp; Approve' : 'Approve &rarr;';
        const confClass = conf >= 0.85 ? 'high' : conf >= 0.65 ? 'medium' : 'low';
        const causeLabels = {
          delayed_receivable: 'Delayed Receivable',
          demand_spike: 'Demand Spike',
          route_contraction: 'Route Contraction',
          insufficient_data: 'Insufficient Data',
        };
        return `
        <div class="queue-card" id="queue-${offer.offer_id}">
          <div class="queue-card-header">
            <div>
              <span class="queue-title">${OPERATORS[offer.operator_id]?.name ?? offer.operator_id}</span>
            </div>
            <span class="queue-amount">\u20B9${(offer.amount / 100000).toFixed(2)}L</span>
          </div>
          <div class="queue-meta">
            <div class="queue-meta-row">
              <span class="queue-meta-label">Tenor</span>
              <span class="queue-meta-value">${offer.tenor_days} days</span>
            </div>
            <div class="queue-meta-row">
              <span class="queue-meta-label">Cause</span>
              <span class="queue-meta-value">${causeLabels[offer.cause] || offer.cause}</span>
            </div>
            <div class="queue-meta-row">
              <span class="queue-meta-label">Confidence</span>
              <span class="queue-meta-value conf-${confClass}">${confPct}%</span>
            </div>
            <div class="queue-meta-row">
              <span class="queue-meta-label">Cost to Operator</span>
              <span class="queue-meta-value">\u20B9${(offer.total_cost ?? 0).toFixed(0)}</span>
            </div>
          </div>
          ${isLowConf ? `<div class="queue-warning">Low confidence — review operator data before approving.</div>` : ''}
          ${offer.reasoning ? `<div class="queue-reasoning">${offer.reasoning.substring(0, 220)}${offer.reasoning.length > 220 ? '...' : ''}</div>` : ''}
          <div class="btn-row">
            <a href="detail.html?id=${offer.operator_id}&offer=${offer.offer_id}" class="btn-approve">
              Review &rarr;
            </a>
            <button class="btn-reject" onclick="rejectOffer('${offer.offer_id}')">
              Reject
            </button>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

async function approveOffer(offerId) {
  // Animate the card out
  const card = document.getElementById(`queue-${offerId}`);
  if (card) card.classList.add('removing');

  // Wait for animation, then fire request + refresh
  setTimeout(async () => {
    try {
      await fetch(`${API}/officer/approve/${offerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
    } catch {}
    await refreshQueue();
  }, 400);
}

async function rejectOffer(offerId) {
  const card = document.getElementById(`queue-${offerId}`);
  if (card) card.classList.add('removing');

  setTimeout(async () => {
    try {
      await fetch(`${API}/officer/reject/${offerId}`, { method: 'POST' });
    } catch {}
    await refreshQueue();
  }, 400);
}

// Boot
init();
