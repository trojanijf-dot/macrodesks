// MacroDesk v5 — app.js
const BASE_US10Y = 4.31;

function showTab(name, btn) {
  document.querySelectorAll('.tab-content').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
  document.getElementById('tab-' + name).classList.add('active');
  btn.classList.add('active');
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

// Init price grid
window.addEventListener('DOMContentLoaded', function() {
  var PRICES = window.MACRODESK_PRICES || {};
  var PAIRS = [['AUD/JPY','AUD/JPY'],['NZD/JPY','NZD/JPY'],['AUD/USD','AUD/USD'],['DXY','DXY'],['Gold','Gold XAU'],['WTI','WTI Crude'],['US10Y','US10Y'],['VIX','VIX']];
  var pg = document.getElementById('price-grid');
  if (pg) {
    pg.innerHTML = PAIRS.map(function(p) {
      var d = PRICES[p[1]] || { price: 'N/A', change: '—' };
      var unit = p[1] === 'US10Y' ? '%' : '';
      var ch = d.change || '—';
      var cls = ch[0] === '+' ? 'up' : ch[0] === '-' ? 'down' : 'flat';
      return '<div class="pi"><div class="plbl">' + p[0] + '</div><div class="pval">' + d.price + unit + '</div><div class="pchg ' + cls + '">' + ch + '</div></div>';
    }).join('');
  }

  // Claude content — strip markdown fences
  var cc = document.getElementById('claude-content');
  if (cc && window.MACRODESK_CLAUDE) {
    var txt = window.MACRODESK_CLAUDE.replace(/^```html\s*/,'').replace(/^```\s*/,'').replace(/```\s*$/,'');
    cc.innerHTML = txt;
  }

  // Dot Plot Fed Funds Rate
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
          y: {
            min: 0, max: 5.5,
            ticks: { callback: function(v) { return v.toFixed(1) + '%'; }, color: '#64748b', font: { size: 10 } },
            grid: { color: 'rgba(100,116,139,0.12)' }
          },
          x: {
            ticks: { color: '#64748b', font: { size: 9 }, maxRotation: 0 },
            grid: { display: false }
          }
        }
      }
    });
  }

  // Init charts
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
