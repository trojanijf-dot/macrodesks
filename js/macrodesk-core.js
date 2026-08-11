/* ============================================================
   MACRODESK — CORE V3.7
   - Fetch macrodata.json avec retry
   - Auto-refresh toutes les 5 minutes
   - Gestion des tabs
   - Initialisation du CSI Chart
   ============================================================ */

(function() {
  'use strict';

  const CONFIG = {
    dataUrl: 'data/macrodata.json',
    refreshIntervalMs: 5 * 60 * 1000, // 5 minutes
    retryDelayMs: 10 * 1000, // 10 secondes
    maxRetries: 3
  };

  let csiChart = null;
  let currentData = null;
  let refreshTimer = null;
  let retryCount = 0;

  // ============================================================
  // FETCH DATA
  // ============================================================
  async function fetchMacroData(showLoading = true) {
    if (showLoading) showLoadingOverlay();
    updateStatus('connecting', 'Chargement...');
    
    try {
      // Cache-busting pour toujours avoir la dernière version
      const url = `${CONFIG.dataUrl}?t=${Date.now()}`;
      const response = await fetch(url, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      retryCount = 0;
      
      // Structure attendue : soit { forceDevises: {...} }, soit directement forceDevises
      const forceDevises = data.forceDevises || data;
      
      if (!forceDevises || !forceDevises.timeSeries) {
        throw new Error('Structure JSON invalide : timeSeries manquant');
      }
      
      currentData = forceDevises;
      window.macroData = { forceDevises: forceDevises };
      
      updateStatus('connected', 'Connecté');
      updateLastUpdate(forceDevises.last_update);
      
      // Alimenter le CSI chart
      if (csiChart) {
        csiChart.setData(forceDevises);
      }
      
      hideLoadingOverlay();
      console.log('[MacroDesk] Data loaded:', {
        timeSeriesPoints: Object.keys(forceDevises.timeSeries || {}).reduce((acc, tf) => {
          acc[tf] = forceDevises.timeSeries[tf].length;
          return acc;
        }, {}),
        currencies: Object.keys(forceDevises.currencies || {}),
        divergences: Object.values(forceDevises.currencies || {}).filter(c => c.divergence !== 'NONE').length
      });
      
      return forceDevises;
    } catch (err) {
      console.error('[MacroDesk] Fetch error:', err);
      retryCount++;
      
      if (retryCount <= CONFIG.maxRetries) {
        updateStatus('connecting', `Réessai ${retryCount}/${CONFIG.maxRetries}...`);
        setTimeout(() => fetchMacroData(false), CONFIG.retryDelayMs);
      } else {
        updateStatus('error', 'Erreur de chargement');
        hideLoadingOverlay();
      }
      
      return null;
    }
  }

  // ============================================================
  // UI STATUS
  // ============================================================
  function updateStatus(state, text) {
    const el = document.getElementById('mdStatusIndicator');
    if (!el) return;
    el.classList.remove('connecting', 'connected', 'error');
    el.classList.add(state);
    const textEl = el.querySelector('.md-status-indicator__text');
    if (textEl) textEl.textContent = text;
  }

  function updateLastUpdate(timestamp) {
    const el = document.getElementById('mdLastUpdate');
    if (!el || !timestamp) return;
    const date = new Date(timestamp);
    el.textContent = `Maj : ${date.toLocaleString('fr-FR', {
      hour: '2-digit', minute: '2-digit',
      day: '2-digit', month: '2-digit'
    })}`;
  }

  function showLoadingOverlay() {
    const overlay = document.getElementById('mdLoadingOverlay');
    if (overlay) overlay.classList.remove('hidden');
  }

  function hideLoadingOverlay() {
    const overlay = document.getElementById('mdLoadingOverlay');
    if (overlay) overlay.classList.add('hidden');
  }

  // ============================================================
  // TABS
  // ============================================================
  function setupTabs() {
    document.querySelectorAll('.md-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        
        // Update buttons
        document.querySelectorAll('.md-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Update panels
        document.querySelectorAll('.md-tab-panel').forEach(p => p.classList.remove('active'));
        const panel = document.getElementById('tab-' + tabId);
        if (panel) panel.classList.add('active');
        
        // Re-render CSI if switching to it (pour recalculer les dimensions)
        if (tabId === 'csi' && csiChart) {
          setTimeout(() => csiChart.render(), 50);
        }
        
        // Render other tabs content if needed
        if (tabId === 'overview') renderOverviewTab();
        if (tabId === 'divergences') renderDivergencesTab();
        if (tabId === 'signals') renderSignalsTab();
      });
    });
  }

  // ============================================================
  // OTHER TABS (Vue d'ensemble, Divergences, Signaux)
  // Placeholder pour l'instant, à étoffer selon besoin
  // ============================================================
  function renderOverviewTab() {
    const container = document.getElementById('mdOverviewContent');
    if (!container || !currentData) return;
    
    const currencies = currentData.currencies || {};
    const heatmap = currentData.heatmapData || {};
    
    let html = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-top:20px">';
    Object.keys(currencies).forEach(code => {
      const c = currencies[code];
      const color = c.avg >= 60 ? '#1fd388' : c.avg <= 40 ? '#ff4d6d' : '#a8b2c0';
      html += `
        <div style="background:#1a2332;border:1px solid #2a3548;border-radius:6px;padding:14px">
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <strong style="font-family:var(--md-mono);font-size:16px">${code}</strong>
            <span style="color:${color};font-family:var(--md-mono);font-size:18px;font-weight:700">${c.avg}</span>
          </div>
          <div style="font-size:10px;color:#6b7689;margin-top:4px">${c.trend || 'NEUTRE'}</div>
          <div style="display:flex;gap:6px;margin-top:8px;font-family:var(--md-mono);font-size:10px;color:#a8b2c0">
            <span>1D: <strong>${c['1D']}</strong></span>
            <span>4H: <strong>${c['4H']}</strong></span>
            <span>1H: <strong>${c['1H']}</strong></span>
          </div>
        </div>
      `;
    });
    html += '</div>';
    container.innerHTML = html;
  }

  function renderDivergencesTab() {
    const container = document.getElementById('mdDivergencesContent');
    if (!container || !currentData) return;
    
    const currencies = currentData.currencies || {};
    const allDivs = [];
    Object.keys(currencies).forEach(code => {
      const c = currencies[code];
      if (c.allDivergences && c.allDivergences.length > 0) {
        c.allDivergences.forEach(d => allDivs.push({ currency: code, ...d, scores: { '1D': c['1D'], '4H': c['4H'], '1H': c['1H'] } }));
      }
    });
    allDivs.sort((a, b) => b.priority - a.priority);
    
    if (allDivs.length === 0) {
      container.innerHTML = '<p style="color:#6b7689;text-align:center;padding:40px">Aucune divergence active · Le marché est aligné</p>';
      return;
    }
    
    let html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;margin-top:20px">';
    allDivs.forEach(d => {
      const color = d.priority === 3 ? '#ff4d6d' : d.priority === 2 ? '#f5a623' : '#ffd54f';
      html += `
        <article style="background:#1a2332;border:1px solid #2a3548;border-top:3px solid ${color};border-radius:8px;padding:16px">
          <div style="display:flex;justify-content:space-between;margin-bottom:12px">
            <h3 style="margin:0;font-family:var(--md-mono);font-size:24px">${d.currency}</h3>
            <span style="padding:4px 10px;background:${color}22;color:${color};border:1px solid ${color}55;border-radius:4px;font-family:var(--md-mono);font-size:11px;font-weight:700">P${d.priority}</span>
          </div>
          <div style="font-family:var(--md-mono);font-size:11px;color:${color};font-weight:700;margin-bottom:10px">${d.type.replace(/_/g, ' ')}</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px">
            <div style="text-align:center;padding:6px;background:#0a0e17;border-radius:4px"><div style="font-size:9px;color:#6b7689">1D</div><div style="font-family:var(--md-mono);font-size:14px;font-weight:700">${d.scores['1D']}</div></div>
            <div style="text-align:center;padding:6px;background:#0a0e17;border-radius:4px"><div style="font-size:9px;color:#6b7689">4H</div><div style="font-family:var(--md-mono);font-size:14px;font-weight:700">${d.scores['4H']}</div></div>
            <div style="text-align:center;padding:6px;background:#0a0e17;border-radius:4px"><div style="font-size:9px;color:#6b7689">1H</div><div style="font-family:var(--md-mono);font-size:14px;font-weight:700">${d.scores['1H']}</div></div>
          </div>
          <p style="font-size:12px;color:#a8b2c0;margin:0;line-height:1.5">${d.note || ''}</p>
        </article>
      `;
    });
    html += '</div>';
    container.innerHTML = html;
  }

  function renderSignalsTab() {
    const container = document.getElementById('mdSignalsContent');
    if (!container || !currentData) return;
    
    const signals = currentData.signals || [];
    const pairs = currentData.pairs || {};
    
    let html = '<div style="margin-top:20px">';
    
    // Pair signals
    html += '<h3 style="color:#e8ecf1;font-size:14px;margin-bottom:12px">Signaux par paire</h3>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-bottom:24px">';
    Object.keys(pairs).forEach(pairKey => {
      const s = pairs[pairKey];
      const color = s.direction.includes('LONG') ? '#1fd388' : s.direction.includes('SHORT') ? '#ff4d6d' : '#6b7689';
      html += `
        <div style="background:#1a2332;border:1px solid #2a3548;border-left:3px solid ${color};border-radius:6px;padding:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <strong style="font-family:var(--md-mono);font-size:15px">${s.pair}</strong>
            <span style="padding:3px 8px;background:${color}22;color:${color};border-radius:3px;font-family:var(--md-mono);font-size:10px;font-weight:600">${s.direction}</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <div style="flex:1;height:6px;background:#0a0e17;border-radius:3px;overflow:hidden">
              <div style="height:100%;background:${color};width:${s.force}%"></div>
            </div>
            <span style="font-family:var(--md-mono);font-size:13px;font-weight:700">${s.force}%</span>
          </div>
          <div style="font-size:10px;color:#6b7689;padding:6px 0;border-top:1px solid #2a3548;margin-top:8px">${s.convergence}</div>
        </div>
      `;
    });
    html += '</div>';
    
    // Raw signals list
    if (signals.length > 0) {
      html += '<h3 style="color:#e8ecf1;font-size:14px;margin-bottom:12px">Tous les signaux</h3>';
      html += '<div style="background:#1a2332;border:1px solid #2a3548;border-radius:6px;padding:14px">';
      signals.forEach(sig => {
        html += `<div style="padding:8px 0;border-bottom:1px dashed #2a3548;font-size:12px;color:#a8b2c0">${sig}</div>`;
      });
      html += '</div>';
    }
    
    html += '</div>';
    container.innerHTML = html;
  }

  // ============================================================
  // REFRESH BUTTON
  // ============================================================
  function setupRefreshButton() {
    const btn = document.getElementById('mdRefreshBtn');
    if (!btn) return;
    
    btn.addEventListener('click', async () => {
      btn.classList.add('spinning');
      await fetchMacroData(false);
      setTimeout(() => btn.classList.remove('spinning'), 500);
    });
  }

  // ============================================================
  // AUTO-REFRESH
  // ============================================================
  function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      fetchMacroData(false);
    }, CONFIG.refreshIntervalMs);
  }

  // ============================================================
  // INIT
  // ============================================================
  function init() {
    console.log('[MacroDesk] V3.7 initializing...');
    
    setupTabs();
    setupRefreshButton();
    
    // Init CSI chart (classe chargée depuis csi-chart.js)
    if (typeof DualCSIChart !== 'undefined') {
      csiChart = new DualCSIChart();
    } else {
      console.error('[MacroDesk] DualCSIChart class not loaded !');
    }
    
    // First fetch
    fetchMacroData(true).then(() => {
      startAutoRefresh();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export for debugging
  window.MacroDesk = {
    refresh: () => fetchMacroData(false),
    getData: () => currentData,
    getChart: () => csiChart,
    config: CONFIG
  };

})();
