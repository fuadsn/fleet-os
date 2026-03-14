/* ═══════════════════════════════════════════════════════════════════
   Fleet Treasury OS — Shared Utilities
   ═══════════════════════════════════════════════════════════════════ */

const API = 'http://localhost:8000';

const OPERATORS = {
  'OP-SHARMA-001': { name: 'Sharma Logistics',      vehicles: 40 },
  'OP-PATEL-004':  { name: 'Patel Roadways',        vehicles: 55 },
  'OP-VERMA-002':  { name: 'Verma Transport',       vehicles: 22 },
  'OP-KHAN-005':   { name: 'Khan Brothers Freight',  vehicles: 18 },
  'OP-GUPTA-003':  { name: 'Gupta Fleet Services',   vehicles: 31 },
  'OP-REDDY-006':  { name: 'Reddy Cargo Movers',    vehicles: 26 },
  'OP-SINGH-007':  { name: 'Singh Express Lines',    vehicles: 48 },
  'OP-JOSHI-008':  { name: 'Joshi Haulage',          vehicles: 15 },
};

// ── SVG Icons (inline for zero-dependency) ──────────────────────────
const ICONS = {
  truck: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
  alert: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  check: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  play: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  back: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
  queue: `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  audit: `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  robot: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><line x1="12" y1="7" x2="12" y2="11"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>`,
  dashboard: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>`,
  queueNav: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/></svg>`,
};

// ── Formatting Helpers ──────────────────────────────────────────────

function formatCurrency(amount) {
  return '\u20B9' + Number(amount).toLocaleString('en-IN');
}

function formatLakhs(amount) {
  return '\u20B9' + (amount / 100000).toFixed(2) + 'L';
}

function formatLakhsShort(amount) {
  return '\u20B9' + (amount / 100000).toFixed(1) + 'L';
}

// ── Fetch Wrapper ───────────────────────────────────────────────────

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, options);
  return response.json();
}

// ── Navigation Header ───────────────────────────────────────────────

function createNavHeader(activePage) {
  const pages = [
    { id: 'dashboard', label: 'Dashboard', href: 'index.html', icon: ICONS.dashboard },
    { id: 'activity',  label: 'Activity Log', href: 'activity.html', icon: ICONS.audit },
    { id: 'queue',     label: 'Review Queue', href: 'queue.html', icon: ICONS.queueNav },
  ];

  const navLinks = pages.map(p => {
    const isActive = p.id === activePage;
    return `<a href="${p.href}" class="nav-link ${isActive ? 'active' : ''}">${p.icon} ${p.label}</a>`;
  }).join('');

  return `
    <header class="app-bar">
      <div class="app-bar-brand">
        <a href="index.html" class="app-bar-logo-link">
          <span class="pine-wordmark">pine labs</span>
          <span class="product-divider"></span>
          <span class="product-name">Fleet Treasury OS</span>
        </a>
      </div>
      <nav class="nav-links">${navLinks}</nav>
      <div id="server-status">
        <span class="status-dot"></span>
        <span class="status-text">Connecting...</span>
      </div>
    </header>`;
}

// ── Connection Status Checker ───────────────────────────────────────

async function checkConnection() {
  const el = document.getElementById('server-status');
  if (!el) return false;
  try {
    const r = await fetch(`${API}/`);
    if (r.ok) {
      el.classList.remove('offline');
      el.classList.add('connected');
      el.querySelector('.status-text').textContent = 'API Connected';
      return true;
    }
  } catch {}
  el.classList.remove('connected');
  el.classList.add('offline');
  el.querySelector('.status-text').textContent = 'API Offline';
  return false;
}

// ── Load All Briefings ──────────────────────────────────────────────

async function loadAllBriefings() {
  const cache = {};
  const promises = Object.keys(OPERATORS).map(async (opId) => {
    try {
      cache[opId] = await fetchJSON(`${API}/fleet/${opId}/briefing`);
    } catch {
      cache[opId] = {};
    }
  });
  await Promise.all(promises);
  return cache;
}
