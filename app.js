// MacroDesk v8 — app.js
// + V2 DMX : 6 donuts Chart.js + 3 gauges radiales + 3 sparklines + pulsation niveau 5
// + Refresh manuel des prix via webhook
// + Animation flash sur changement de prix
// + Heure live mise à jour dans topbar
// + Optimisation mobile Android/Brave
const BASE_US10Y = 4.31;
const WEBHOOK_URL = 'https://jftrojani77.app.n8n.cloud/webhook/prices-live';

function showTab(name, btn) {
  document.querySelectorAll('.tab-content').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
  document.getElementById('tab-' + name).classList.add('active');
  btn.classList.add('active');
  window.scrollTo({ top: document.querySelector('.tabs-bar').offsetTop - 10, behavior: 'smooth' });
}

function showTech(pair) {
  ['audjpy','nzdjpy','audusd'].forEach(function(p) {
    var el = document.getElementById('tech-' + p);
    var btn = document.getElementById('tech-btn-' + p);
    if (el) el.style.display = p === pair ? 'block' : 'none';
    if (btn) btn.className = p === pair ? 'pair-btn active' : 'pair-btn';
  });
}

function showSent(pair) {
  ['audjpy','nzdjpy','audusd'].forEach(function(p) {
    var el = document.getElementById('sent-' + p);
    var btn = document.getElementById('sent-btn-' + p);
    if (el) el.style.display = p === pair ? 'block' : 'none';
    if (btn) btn.className = p === pair ? 'pair-btn active' : 'pair-btn';
  });
}

// ============================================================
// REFRESH PRIX LIVE VIA WEBHOOK
// ============================================================
async function refreshPrices() {
  var btn = document.getElementById('refresh-btn');
  var status = document.getElementById('refresh-status');
  if (!btn) return;

  btn.disabled = true;
  btn.innerHTML = '⏳';
  btn.style.opacity = '0.6';

  try {
    var response = await fetch(WEBHOOK_URL);
    var data = await response.json();
    var result = Array.isArray(data) ? data[0] : data;
    var newPrices = result.prices || {};

    if (Object.keys(newPrices).length === 0) {
      throw new Error('Aucun prix reçu');
    }

    updatePriceGrid(newPrices);
    window.MACRODESK_PRICES = Object.assign(window.MACRODESK_PRICES || {}, newPrices);

    var now = new Date();
    var timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    if (status) {
      status.textContent = '✓ ' + timeStr;
      status.style.color = '#10b981';
    }

    var topbarTime = document.getElementById('topbar-time');
    if (topbarTime) {
      topbarTime.textContent = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + ' NCT';
    }

    updateCryptoRiskFlow(newPrices);

    btn.innerHTML = '🔄';
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.background = 'rgba(16,185,129,0.3)';
    setTimeout(function() { btn.style.background = ''; }, 1000);

  } catch(e) {
    if (status) {
      status.textContent = '✗ Erreur';
      status.style.color = '#f43f5e';
    }
    btn.innerHTML = '🔄';
    btn.disabled = false;
    btn.style.opacity = '1';
    console.log('Refresh error:', e);
  }
}

function updatePriceGrid(newPrices) {
  var PAIRS = [
    ['AUD/JPY','AUD/JPY'], ['NZD/JPY','NZD/JPY'], ['AUD/USD','AUD/USD'],
    ['DXY','DXY'], ['Gold','Gold XAU'], ['WTI','WTI Crude'],
    ['US10Y','US10Y'], ['VIX','VIX'], ['BTC','BTC/USD']
  ];

  var pg = document.getElementById('price-grid');
  if (!pg) return;

  var oldPrices = window.MACRODESK_PRICES || {};

  pg.innerHTML = PAIRS.map(function(p) {
    var d = newPrices[p[1]] || oldPrices[p[1]] || { price: 'N/A', change: '—' };
    var unit = p[1] === 'US10Y' ? '%' : '';
    var ch = d.change || '—';
    var cls = ch[0] === '+' ? 'up' : ch[0] === '-' ? 'down' : 'flat';
    var oldPrice = (oldPrices[p[1]] || {}).price;
    var priceChanged = oldPrice && oldPrice !== d.price;
    var flashClass = priceChanged ? (parseFloat(d.change) >= 0 ? 'flash-up' : 'flash-down') : '';

    return '<div class="pi ' + flashClass + '">'
      + '<div class="plbl">' + p[0] + '</div>'
      + '<div class="pval">' + d.price + unit + '</div>'
      + '<div class="pchg ' + cls + '">' + ch + '</div>'
      + (d.changePct ? '<div class="pchg ' + cls + '" style="font-size:9px">' + d.changePct + '</div>' : '')
      + '</div>';
  }).join('');

  setTimeout(function() {
    document.querySelectorAll('.flash-up,.flash-down').forEach(function(el) {
      el.classList.remove('flash-up', 'flash-down');
    });
  }, 1500);
}

function updateCryptoRiskFlow(newPrices) {
  var btcData = newPrices['BTC/USD'];
  var vixData = newPrices['VIX'];
  var goldData = newPrices['Gold XAU'];
  if (!btcData) return;

  var btcChangePct = parseFloat(btcData.changePct || '0');
  var vixChange = parseFloat((vixData || {}).change || '0');
  var goldChange = parseFloat((goldData || {}).change || '0');

  var signal = 0;
  if (btcChangePct > 3) signal -= 2;
  else if (btcChangePct > 1) signal -= 1;
  else if (btcChangePct < -3) signal += 2;
  else if (btcChangePct < -1) signal += 1;
  if (vixChange > 2 && btcChangePct < -1) signal += 1.5;
  if (vixChange < -2 && btcChangePct > 1) signal -= 1.5;
  if (goldChange > 0 && btcChangePct < -1) signal += 1;
  signal = Math.round(signal * 10) / 10;

  var els = document.querySelectorAll('.pi');
  els.forEach(function(el) {
    var lbl = el.querySelector('.plbl');
    if (!lbl) return;
    if (lbl.textContent === 'BTC/USD') {
      el.querySelector('.pval').textContent = btcData.price;
      var chgEl = el.querySelector('.pchg');
      if (chgEl) {
        chgEl.textContent = btcData.change;
        chgEl.className = 'pchg ' + (parseFloat(btcData.change) >= 0 ? 'up' : 'down');
      }
    }
  });
}

// ============================================================
// NOUVEAU V2 — DMX CONVICTION : RENDU CHART.JS
// ============================================================

// Palette couleur selon niveau DMX
function dmxColors(level) {
  if (level === 5) return { main: '#f43f5e', bg: 'rgba(244,63,94,0.08)', glow: 'rgba(244,63,94,0.3)' };
  if (level === 4) return { main: '#a78bfa', bg: 'rgba(167,139,250,0.15)', glow: 'rgba(167,139,250,0.4)' };
  if (level === 3) return { main: '#a78bfa', bg: 'rgba(167,139,250,0.08)', glow: 'rgba(167,139,250,0.2)' };
  if (level === 2) return { main: '#fbbf24', bg: 'rgba(251,191,36,0.05)', glow: 'rgba(251,191,36,0.15)' };
  return { main: '#64748b', bg: 'rgba(100,116,139,0.05)', glow: 'rgba(100,116,139,0.1)' };
}

// Création d'un donut Chart.js pour Inst ou Retail
function createDmxDonut(canvasId, longPct, shortPct, label) {
  var canvas = document.getElementById(canvasId);
  if (!canvas || !window.Chart) return null;

  return new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: [label + ' LONG', label + ' SHORT'],
      datasets: [{
        data: [longPct, shortPct],
        backgroundColor: ['#10b981', '#f43f5e'],
        borderColor: '#080e1c',
        borderWidth: 2,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(6,12,24,0.95)',
          borderColor: 'rgba(100,116,139,0.3)',
          borderWidth: 1,
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          padding: 8,
          callbacks: {
            label: function(c) { return c.label + ': ' + c.parsed.toFixed(1) + '%'; }
          }
        }
      },
      animation: { duration: 800, easing: 'easeOutQuart' }
    }
  });
}

// Gauge radiale semi-circulaire pour conviction
function createConvictionGauge(canvasId, conviction, color) {
  var canvas = document.getElementById(canvasId);
  if (!canvas || !window.Chart) return null;

  var remainingColor = 'rgba(100,116,139,0.15)';

  return new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [conviction, 100 - conviction],
        backgroundColor: [color, remainingColor],
        borderColor: '#080e1c',
        borderWidth: 0,
        circumference: 180,
        rotation: 270
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '75%',
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      },
      animation: { duration: 1200, easing: 'easeOutQuart' }
    }
  });
}

// Sparkline 12 semaines pour évolution du niveau DMX
function createDmxSparkline(canvasId, history, color) {
  var canvas = document.getElementById(canvasId);
  if (!canvas || !window.Chart) return null;

  var data = (history || []).map(function(h) { return h.level; });
  var labels = (history || []).map(function(h) { return h.date; });

  // Remplir avec des niveaux 1 si pas assez de données
  while (data.length < 12) {
    data.unshift(1);
    labels.unshift('');
  }
  data = data.slice(-12);
  labels = labels.slice(-12);

  return new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        borderColor: color,
        backgroundColor: color.replace('rgb', 'rgba').replace(')', ',0.15)'),
        borderWidth: 2,
        pointRadius: 2,
        pointBackgroundColor: color,
        pointBorderColor: color,
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(6,12,24,0.95)',
          borderColor: 'rgba(100,116,139,0.3)',
          borderWidth: 1,
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          padding: 8,
          callbacks: {
            title: function(items) { return items[0].label || 'Semaine ' + items[0].dataIndex; },
            label: function(c) {
              var levels = ['—', 'NEUTRE', 'MODÉRÉ', 'FORT ⚡', 'EXTRÊME 🔥', 'EXTREMUM 💀'];
              return 'Niveau ' + c.parsed.y + ' — ' + (levels[c.parsed.y] || 'N/A');
            }
          }
        }
      },
      scales: {
        y: { min: 0, max: 5, display: false, grid: { display: false } },
        x: { display: false, grid: { display: false } }
      },
      animation: { duration: 1000 }
    }
  });
}

// Rendu complet DMX : appelé depuis DOMContentLoaded
function renderDMX() {
  var dmx = window.MACRODESK_DMX;
  if (!dmx || !dmx.currencies) return;

  var currencies = ['AUD', 'NZD', 'JPY'];

  currencies.forEach(function(code) {
    var cur = dmx.currencies[code];
    if (!cur || !cur.dmx) return;

    var colors = dmxColors(cur.dmx.level);
    var lowerCode = code.toLowerCase();

    // 1. Donut Institutionnels
    createDmxDonut(
      'dmx-donut-inst-' + lowerCode,
      cur.institutional.longPct,
      cur.institutional.shortPct,
      'Inst.'
    );

    // 2. Donut Retail
    createDmxDonut(
      'dmx-donut-retail-' + lowerCode,
      cur.retail.longPct,
      cur.retail.shortPct,
      'Retail'
    );

    // 3. Gauge Conviction
    createConvictionGauge(
      'dmx-gauge-' + lowerCode,
      cur.dmx.conviction,
      colors.main
    );

    // 4. Sparkline 12 semaines
    var historyKey = lowerCode;
    var history = (dmx.history && dmx.history[historyKey]) || [];
    createDmxSparkline(
      'dmx-spark-' + lowerCode,
      history,
      colors.main
    );

    // 5. Effet pulsation pour niveau 5
    if (cur.dmx.level === 5) {
      var card = document.getElementById('dmx-card-' + lowerCode);
      if (card) card.classList.add('dmx-pulse-5');
    } else if (cur.dmx.level === 4) {
      var card4 = document.getElementById('dmx-card-' + lowerCode);
      if (card4) card4.classList.add('dmx-pulse-4');
    }
  });
}

// ============================================================
// FONCTIONS EXISTANTES (inchangées)
// ============================================================
function updateDash() {
  var nfp = parseFloat(document.getElementById('d-nfp').value);
  var cpi = parseFloat(document.getElementById('d-cpi').value);
  var pce = parseFloat(document.getElementById('d-pce').value);
  document.getElementById('d-v-nfp').textContent = (nfp > 0 ? '+' : '') + nfp;
  document.getElementById('d-v-cpi').textContent = cpi.toFixed(1);
  document.getElementById('d-v-pce').textContent = pce.toFixed(1);
  var s = 0;
  if (nfp > 150) s += 2; else if (nfp < 0) s -= 2;
  if (cpi > 3.5) s += 2.5; else if (cpi < 2) s -= 2;
  if (pce > 3) s += 2; else if (pce < 2) s -= 2;
  s = Math.round(s * 10) / 10;
  var c = s > 1 ? 'var(--red)' : s < -1 ? 'var(--green)' : 'var(--amber)';
  document.getElementById('d-fomc-s').textContent = (s > 0 ? '+' : '') + s;
  document.getElementById('d-fomc-s').style.color = c;
  document.getElementById('d-dxy-b').textContent = s > 1 ? 'HAUSSIER' : s < -1 ? 'BAISSIER' : 'RANGE';
  document.getElementById('d-rev-r').textContent = Math.round(Math.min(90, Math.abs(s) * 8 + 20)) + '%';
}

function updateYield() {
  var y = parseFloat(document.getElementById('sl-10y').value);
  document.getElementById('v-10y').textContent = y.toFixed(2) + '%';
  var d = y - BASE_US10Y;
  var aj = Math.round(d * -105), nj = Math.round(d * -120), au = Math.round(d * -42);
  var fmt = function(v) { return (v > 0 ? '+' : '') + v + ' pips'; };
  var col = function(v) { return v < 0 ? 'var(--red)' : v > 0 ? 'var(--green)' : 'var(--teal)'; };
  document.getElementById('yi-aj').textContent = fmt(aj);
  document.getElementById('yi-aj').style.color = col(aj);
  document.getElementById('yi-nj').textContent = fmt(nj);
  document.getElementById('yi-nj').style.color = col(nj);
  document.getElementById('yi-au').textContent = fmt(au);
  document.getElementById('yi-au').style.color = col(au);
  var verd = Math.abs(d) < 0.02 ? 'US10Y stable. Pas de changement de biais.' :
    d > 0 ? 'US10Y en hausse +' + d.toFixed(2) + '% → Risk-off → JPY apprécie → AUD/JPY NZD/JPY sous pression.' :
    'US10Y en baisse ' + d.toFixed(2) + '% → Détente risk-off → Rebond possible AUD/JPY NZD/JPY.';
  document.getElementById('yield-verdict').textContent = verd;
}

function updateYield2() {
  var y = parseFloat(document.getElementById('t-sl-10y').value);
  document.getElementById('t-v-10y').textContent = y.toFixed(2) + '%';
  var d = y - BASE_US10Y;
  var aj = Math.round(d * -105), nj = Math.round(d * -120), au = Math.round(d * -42);
  var fmt = function(v) { return (v > 0 ? '+' : '') + v + ' pips'; };
  var col = function(v) { return v < 0 ? 'var(--red)' : v > 0 ? 'var(--green)' : 'var(--teal)'; };
  var bias = function(v) { return Math.abs(v) < 3 ? 'Neutre' : v < 0 ? 'Bearish ↓' : 'Bullish ↑'; };
  document.getElementById('t-yi-aj').textContent = fmt(aj);
  document.getElementById('t-yi-aj').style.color = col(aj);
  document.getElementById('t-yi-nj').textContent = fmt(nj);
  document.getElementById('t-yi-nj').style.color = col(nj);
  document.getElementById('t-yi-au').textContent = fmt(au);
  document.getElementById('t-yi-au').style.color = col(au);
  document.getElementById('t-yi-aj-b').textContent = bias(aj);
  document.getElementById('t-yi-nj-b').textContent = bias(nj);
  document.getElementById('t-yi-au-b').textContent = bias(au);
  var verd = Math.abs(d) < 0.02 ? 'US10Y stable à ' + y.toFixed(2) + '%. Pas de changement de biais.' :
    d > 0 ? 'US10Y en hausse +' + d.toFixed(2) + '% → Risk-off → JPY apprécie → SHORT renforcé.' :
    'US10Y en baisse ' + d.toFixed(2) + '% → Détente risk-off → Rebond AUD/JPY NZD/JPY possible.';
  document.getElementById('t-yield-verdict').textContent = verd;
}

function updateFOMC() {
  var nfp = parseFloat(document.getElementById('fomc-nfp').value);
  var cpi = parseFloat(document.getElementById('fomc-cpi').value);
  var pce = parseFloat(document.getElementById('fomc-pce').value);
  var unemp = parseFloat(document.getElementById('fomc-unemp').value);
  var cuts = parseFloat(document.getElementById('fomc-cuts').value);
  var tone = document.getElementById('fomc-tone').value;
  document.getElementById('fv-nfp').textContent = (nfp > 0 ? '+' : '') + nfp;
  document.getElementById('fv-cpi').textContent = cpi.toFixed(1);
  document.getElementById('fv-pce').textContent = pce.toFixed(1);
  document.getElementById('fv-unemp').textContent = unemp.toFixed(1);
  document.getElementById('fv-cuts').textContent = cuts;
  var s = 0;
  s += (nfp - 100) / 50;
  s += (cpi - 2.5) * 1.5;
  s += (pce - 2.2) * 1.5;
  s -= (unemp - 4.0) * 0.5;
  s -= cuts * 0.5;
  if (tone === 'hawkish') s += 2;
  if (tone === 'dovish') s -= 2;
  if (tone === 'surprise_hawk') s += 4;
  if (tone === 'surprise_dove') s -= 4;
  s = Math.round(s * 10) / 10;
  var pct = Math.min(Math.abs(s) / 10 * 100, 100);
  var c = s > 2 ? 'var(--red)' : s < -2 ? 'var(--green)' : 'var(--amber)';
  document.getElementById('fomc-score').textContent = (s > 0 ? '+' : '') + s;
  document.getElementById('fomc-score').style.color = c;
  var biais, action, lbl, verd, risk;
  if (s > 4) { biais = 'TRÈS HAUSSIER'; action = 'Short AUD · Short NZD · Long DXY'; lbl = 'TRÈS HAWKISH'; risk = Math.round(20 + pct * 0.5); verd = 'Environnement fortement hawkish. DXY devrait breakout. SHORT AUD/JPY, NZD/JPY, AUD/USD avec conviction maximale.'; }
  else if (s > 1.5) { biais = 'HAUSSIER'; action = 'Short AUD · Sell NZD'; lbl = 'HAWKISH'; risk = Math.round(40 + pct * 0.3); verd = 'Hawkish confirmé. NFP + CPI + PCE ne permettent pas à la Fed de couper. Maintenir SHORT AUD/USD, AUD/JPY, NZD/JPY.'; }
  else if (s > -1.5) { biais = 'NEUTRE'; action = 'Attendre données'; lbl = 'NEUTRE'; risk = 60; verd = 'Signal mixte. Éviter nouvelles positions directionnelles DXY sans catalyseur.'; }
  else if (s > -4) { biais = 'BAISSIER'; action = 'Rebond AUD/NZD possible'; lbl = 'DOVISH'; risk = Math.round(40 + Math.abs(pct) * 0.3); verd = 'Pression pour coupe Fed augmente. DXY vulnérable. Réduire exposition SELL.'; }
  else { biais = 'TRÈS BAISSIER'; action = 'Long AUD/NZD · Short USD'; lbl = 'TRÈS DOVISH'; risk = 20; verd = 'Fed devrait couper. DXY sous pression majeure. Inverser : long AUD/JPY, NZD/JPY.'; }
  document.getElementById('fomc-biais').textContent = biais;
  document.getElementById('fomc-action').textContent = action;
  document.getElementById('fomc-score-lbl').textContent = lbl;
  document.getElementById('fomc-score-lbl').style.color = c;
  document.getElementById('fomc-risk').textContent = risk + '%';
  document.getElementById('fomc-risk-lbl').textContent = risk > 60 ? 'ÉLEVÉ' : risk > 40 ? 'MODÉRÉ' : 'FAIBLE';
  document.getElementById('fomc-bar').style.width = pct + '%';
  document.getElementById('fomc-bar').style.background = c;
  document.getElementById('fomc-verdict').textContent = verd;
}

function toggleCheck(item) {
  var box = item.querySelector('.cb');
  var txt = item.querySelector('.ck-txt');
  box.classList.toggle('on');
  txt.classList.toggle('on');
}

function checkAll() {
  document.querySelectorAll('#fomc-checklist .check-item').forEach(function(item) {
    item.querySelector('.cb').classList.add('on');
    item.querySelector('.ck-txt').classList.add('on');
  });
}

function resetChecks() {
  document.querySelectorAll('#fomc-checklist .check-item').forEach(function(item) {
    item.querySelector('.cb').classList.remove('on');
    item.querySelector('.ck-txt').classList.remove('on');
  });
}

function updateSimFibo() {
  var r = parseInt(document.getElementById('sim-retail').value);
  var f = parseInt(document.getElementById('sim-fund').value);
  document.getElementById('sim-retail-v').textContent = r + '%';
  document.getElementById('sim-fund-v').textContent = f + '%';
  var msg;
  if (r >= 75 && f >= 75) msg = 'OVERCROWDED EXTRÊME + Fondamental fort. Sweep quasi-certain. Attendre le sweep puis SHORT SL serré.';
  else if (r >= 75) msg = 'Retail extrême mais fondamental faible. Sweep probable MAIS move post-sweep peut manquer de force.';
  else if (r >= 65 && f >= 75) msg = 'Overcrowded modéré + Fondamental fort. Sweep possible. Entrer SL 96.44+ ou attendre confirmation.';
  else if (r < 60) msg = 'Retail peu concentré. Risque sweep limité. Entrée directe sur résistance avec stop standard.';
  else msg = 'Signal mixte. Suivre le fondamental, attendre setup technique clair.';
  document.getElementById('sim-fibo-verdict').textContent = msg;
}

// ============================================================
// INIT
// ============================================================
window.addEventListener('DOMContentLoaded', function() {
  var PRICES = window.MACRODESK_PRICES || {};

  // Injecter le CSS mobile + animations flash + effets DMX
  var style = document.createElement('style');
  style.textContent = ''
    // Animations flash prix
    + '@keyframes flashUp{0%{background:rgba(16,185,129,0.3)}100%{background:var(--bg3)}}'
    + '@keyframes flashDown{0%{background:rgba(244,63,94,0.3)}100%{background:var(--bg3)}}'
    + '.flash-up{animation:flashUp 1.5s ease-out;}'
    + '.flash-down{animation:flashDown 1.5s ease-out;}'
    // Bouton refresh
    + '#refresh-btn{padding:6px 10px;border-radius:4px;border:1px solid rgba(45,212,191,0.4);background:rgba(45,212,191,0.1);color:#2dd4bf;font-family:var(--mono);font-size:12px;font-weight:600;cursor:pointer;transition:all .2s;min-height:32px;}'
    + '#refresh-btn:hover{background:rgba(45,212,191,0.25);border-color:#2dd4bf;}'
    + '#refresh-btn:disabled{cursor:wait;}'
    + '#refresh-status{font-size:9px;color:var(--muted);}'
    // === DMX V2 === Pulsation niveau 5 EXTREMUM ABSOLU
    + '@keyframes dmxPulse5{0%,100%{box-shadow:0 0 0 0 rgba(244,63,94,0.4),inset 0 0 0 1px rgba(244,63,94,0.3);}50%{box-shadow:0 0 18px 3px rgba(244,63,94,0.6),inset 0 0 0 2px rgba(244,63,94,0.5);}}'
    + '.dmx-pulse-5{animation:dmxPulse5 2.5s ease-in-out infinite;}'
    // Halo niveau 4 EXTRÊME
    + '@keyframes dmxPulse4{0%,100%{box-shadow:0 0 0 0 rgba(167,139,250,0.3);}50%{box-shadow:0 0 14px 2px rgba(167,139,250,0.5);}}'
    + '.dmx-pulse-4{animation:dmxPulse4 3s ease-in-out infinite;}'
    // DMX containers
    + '.dmx-donut-wrap{position:relative;width:100%;height:90px;margin:6px 0;}'
    + '.dmx-donut-center{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none;}'
    + '.dmx-donut-center .dm-big{font-size:13px;font-weight:800;line-height:1.1;}'
    + '.dmx-donut-center .dm-small{font-size:8px;color:var(--muted);letter-spacing:.1em;text-transform:uppercase;}'
    + '.dmx-gauge-wrap{position:relative;width:100%;height:70px;margin-bottom:6px;}'
    + '.dmx-gauge-center{position:absolute;top:70%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none;}'
    + '.dmx-gauge-center .dm-big{font-size:20px;font-weight:800;line-height:1;font-family:var(--display);}'
    + '.dmx-gauge-center .dm-small{font-size:8px;color:var(--muted);letter-spacing:.1em;text-transform:uppercase;margin-top:2px;}'
    + '.dmx-spark-wrap{position:relative;width:100%;height:36px;margin-top:8px;}'
    + '.dmx-spark-label{display:flex;justify-content:space-between;font-size:8px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px;}'
    // Mobile
    + '@media(max-width:768px){'
    + '.topbar{flex-direction:column;align-items:flex-start;gap:8px;padding:10px 12px;}'
    + '.topbar>div{width:100%;display:flex;flex-wrap:wrap;align-items:center;gap:6px;}'
    + '.logo{font-size:16px;}'
    + '.tabs-bar{gap:0;padding:0;-webkit-overflow-scrolling:touch;}'
    + '.tab-btn{padding:12px 10px;font-size:11px;min-height:44px;}'
    + '.g8{grid-template-columns:repeat(3,1fr)!important;gap:6px;}'
    + '.pi{padding:10px 6px;}'
    + '.pi .plbl{font-size:10px;}'
    + '.pi .pval{font-size:16px;}'
    + '.pi .pchg{font-size:11px;}'
    + '.g2{grid-template-columns:1fr!important;}'
    + '.g3{grid-template-columns:1fr!important;}'
    + '.g4{grid-template-columns:1fr 1fr!important;}'
    + '.phases{grid-template-columns:1fr!important;}'
    + 'table{display:block;overflow-x:auto;-webkit-overflow-scrolling:touch;}'
    + 'input[type=range]{height:6px;}'
    + 'input[type=range]::-webkit-slider-thumb{width:20px;height:20px;}'
    + '.slider-row{padding:4px 0;}'
    + '.slider-row label{font-size:11px;min-width:90px;}'
    + '.slider-row span{font-size:12px;}'
    + '.pair-card{padding:12px 10px;}'
    + '.slbl{font-size:10px;margin:12px 0 6px;}'
    + '.card{padding:12px 10px;margin-bottom:10px;}'
    + '.ctitle{font-size:10px;}'
    + '.verdict{font-size:12px;padding:10px;}'
    + '#refresh-btn{padding:8px 14px;font-size:13px;min-height:40px;}'
    + '.badge{font-size:10px;padding:3px 8px;}'
    + '.ep-grid{grid-template-columns:1fr!important;}'
    // DMX mobile : donuts plus petits
    + '.dmx-donut-wrap{height:75px;}'
    + '.dmx-gauge-wrap{height:55px;}'
    + '.dmx-donut-center .dm-big{font-size:11px;}'
    + '.dmx-gauge-center .dm-big{font-size:17px;}'
    + '}'
    // Petit écran (< 400px)
    + '@media(max-width:400px){'
    + '.g8{grid-template-columns:repeat(2,1fr)!important;}'
    + '.pi .pval{font-size:14px;}'
    + '.logo{font-size:14px;}'
    + '}';
  document.head.appendChild(style);

  // Ajouter le bouton Refresh dans la topbar
  var topbar = document.querySelector('.topbar');
  if (topbar) {
    var rightSide = topbar.querySelector('div:last-child');
    if (rightSide) {
      var spans = rightSide.querySelectorAll('span');
      spans.forEach(function(span) {
        if (span.textContent.includes('NCT') || span.textContent.includes('AEDT')) {
          span.id = 'topbar-time';
        }
      });

      var refreshContainer = document.createElement('div');
      refreshContainer.style.cssText = 'display:flex;align-items:center;gap:6px;';
      refreshContainer.innerHTML = '<button id="refresh-btn" onclick="refreshPrices()">🔄 Refresh</button><span id="refresh-status"></span>';
      rightSide.insertBefore(refreshContainer, rightSide.firstChild);
    }
  }

  // Horloge live
  function updateClock() {
    var topbarTime = document.getElementById('topbar-time');
    if (topbarTime) {
      var now = new Date();
      topbarTime.textContent = now.toLocaleTimeString('fr-FR', {
        timeZone: 'Pacific/Noumea',
        hour: '2-digit',
        minute: '2-digit'
      }) + ' NCT';
    }
  }
  setInterval(updateClock, 60000);
  updateClock();

  // Init price grid
  var PAIRS = [
    ['AUD/JPY','AUD/JPY'], ['NZD/JPY','NZD/JPY'], ['AUD/USD','AUD/USD'],
    ['DXY','DXY'], ['Gold','Gold XAU'], ['WTI','WTI Crude'],
    ['US10Y','US10Y'], ['VIX','VIX'], ['BTC','BTC/USD']
  ];
  var pg = document.getElementById('price-grid');
  if (pg) {
    pg.innerHTML = PAIRS.map(function(p) {
      var d = PRICES[p[1]] || { price: 'N/A', change: '—' };
      var unit = p[1] === 'US10Y' ? '%' : '';
      var ch = d.change || '—';
      var cls = ch[0] === '+' ? 'up' : ch[0] === '-' ? 'down' : 'flat';
      return '<div class="pi"><div class="plbl">' + p[0] + '</div><div class="pval">' + d.price + unit + '</div><div class="pchg ' + cls + '">' + ch + '</div>'
        + (d.changePct ? '<div class="pchg ' + cls + '" style="font-size:9px">' + d.changePct + '</div>' : '')
        + '</div>';
    }).join('');
  }

  // Claude content
  var cc = document.getElementById('claude-content');
  if (cc && window.MACRODESK_CLAUDE) {
    var txt = window.MACRODESK_CLAUDE.replace(/^```html\s*/,'').replace(/^```\s*/,'').replace(/```\s*$/,'');
    cc.innerHTML = txt;
  }

  // === NOUVEAU V2 : Rendu DMX après un court délai pour s'assurer que les canvas sont prêts ===
  setTimeout(renderDMX, 100);

  // Dot Plot
  var dp = document.getElementById('dotPlotChart');
  if (dp && window.Chart) {
    var fedRate = 3.625;
    var us10yPrice = parseFloat(((window.MACRODESK_PRICES || {})['US10Y'] || {}).price || 4.313);
    new Chart(dp.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['Fed Funds\nActuel', 'US10Y\nMarché', 'Dot Plot\n2025 fin', 'Dot Plot\n2026', 'Dot Plot\n2027', 'Neutre LT'],
        datasets: [{
          data: [fedRate, us10yPrice, 3.625, 3.125, 2.875, 2.5],
          backgroundColor: ['#f43f5e','#38bdf8','#fbbf24','#10b981','#10b981','#2dd4bf'],
          borderRadius: 4,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function(c) { return c.parsed.y.toFixed(3) + '%'; } } }
        },
        scales: {
          y: { min: 0, max: 5.5, ticks: { callback: function(v) { return v.toFixed(1) + '%'; }, color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(100,116,139,0.12)' } },
          x: { ticks: { color: '#64748b', font: { size: 9 }, maxRotation: 0 }, grid: { display: false } }
        }
      }
    });
  }

  // Yield curves
  var yc = document.getElementById('yieldChart');
  if (yc && window.Chart) {
    new Chart(yc.getContext('2d'), {
      type: 'line',
      data: { labels: ['3M','6M','1Y','2Y','3Y','5Y','7Y','10Y','20Y','30Y'], datasets: [
        { label: 'Actuelle', data: [4.45,4.42,4.38,4.28,4.25,4.22,4.28,4.31,4.48,4.58], borderColor: '#f43f5e', backgroundColor: 'rgba(244,63,94,0.05)', borderWidth: 2, pointRadius: 3, tension: 0.4, fill: true },
        { label: 'Normale', data: [3.2,3.4,3.6,3.8,4.0,4.2,4.35,4.5,4.6,4.65], borderColor: '#38bdf8', borderWidth: 1.5, borderDash: [4,4], pointRadius: 2, tension: 0.4, fill: false }
      ]},
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { min: 3.0, max: 5.0, ticks: { callback: function(v) { return v.toFixed(1) + '%'; }, color: '#64748b', font: { size: 9 } }, grid: { color: 'rgba(100,116,139,0.1)' } }, x: { ticks: { color: '#64748b', font: { size: 9 } }, grid: { display: false } } } }
    });
  }
  var yc2 = document.getElementById('yieldChart2');
  if (yc2 && window.Chart) {
    new Chart(yc2.getContext('2d'), {
      type: 'line',
      data: { labels: ['3M','6M','1Y','2Y','3Y','5Y','7Y','10Y','20Y','30Y'], datasets: [
        { label: 'Actuelle (stagflation)', data: [4.45,4.42,4.38,4.28,4.25,4.22,4.28,4.31,4.48,4.58], borderColor: '#f43f5e', backgroundColor: 'rgba(244,63,94,0.08)', borderWidth: 2, pointRadius: 4, tension: 0.4, fill: true },
        { label: 'Normale (croissance)', data: [3.2,3.4,3.6,3.8,4.0,4.2,4.35,4.5,4.6,4.65], borderColor: '#38bdf8', borderWidth: 1.5, borderDash: [4,4], pointRadius: 2, tension: 0.4, fill: false }
      ]},
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#64748b', font: { size: 10 }, boxWidth: 12 } } }, scales: { y: { min: 3.0, max: 5.0, ticks: { callback: function(v) { return v.toFixed(1) + '%'; }, color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(100,116,139,0.12)' } }, x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { display: false } } } }
    });
  }
});
