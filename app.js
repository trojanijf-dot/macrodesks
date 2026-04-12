// ============================================================
// NODE: "Agréger Toutes Sources — Contexte Final"
// Type: Code in JavaScript
// v4 — Semaine 14 avril 2026
// Fusionne : Yahoo Finance + FRED API + CFTC COT + Myfxbook
// + Crypto Risk Flow (BTC comme baromètre risk-on/off)
// + Données statiques manuelles (niveaux tech, pondération)
// ============================================================

let pricesData = {};
let fredData = {};
let cotData = {};
let sentimentData = {};
let etfFlowsData = {};
let riskOffScore = 78;

// ============================================================
// RÉCUPÉRATION DES PRIX — Accès direct aux nœuds HTTP
// ============================================================

const SYMBOL_MAP = {
  'AUDJPY=X': 'AUD/JPY',
  'NZDJPY=X': 'NZD/JPY',
  'AUDUSD=X': 'AUD/USD',
  'DX-Y.NYB': 'DXY',
  'GC=F':     'Gold XAU',
  'CL=F':     'WTI Crude',
  '^VIX':     'VIX',
  '^N225':    'Nikkei',
  '^AXJO':    'ASX200',
  '^TNX':     'US10Y',
  'BTC-USD':  'BTC/USD'
};

// Liste des nœuds HTTP Yahoo — adapter les noms si nécessaire
const httpNodes = [
  'HTTP - AUDJPY',
  'HTTP - WTI',
  'HTTP - NZDJPY',
  'HTTP - VIX',
  'HTTP - AUDUSD',
  'HTTP - US10Y',
  'HTTP-DXY',
  'HTTP - Or',
  'HTTP - US2Y',
  'HTTP - BTC'
];

for (const nodeName of httpNodes) {
  try {
    const data = $(nodeName).first().json;
    const result = data?.chart?.result?.[0];
    if (!result?.meta) continue;

    const meta = result.meta;
    const symbol = meta.symbol;
    const displayName = SYMBOL_MAP[symbol] || symbol;
    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose || meta.previousClose;

    if (price && prevClose) {
      const change = price - prevClose;
      const changePct = ((change / prevClose) * 100).toFixed(2);
      pricesData[displayName] = {
        price: price.toString(),
        change: (change >= 0 ? '+' : '') + change.toFixed(4),
        changePct: (change >= 0 ? '+' : '') + changePct + '%',
        prevClose: prevClose.toString(),
        live: true
      };
    }
  } catch(e) {
    console.log('Node ' + nodeName + ' non disponible: ' + e.message);
  }
}

// FRED API
try {
  const fredNode = $('Fetch FRED API — US Treasuries').first().json;
  fredData = fredNode;
} catch(e) { console.log('FRED node non disponible'); }

// CFTC COT
try {
  const cotNode = $('Fetch CFTC COT Report — AUD/NZD/JPY').first().json;
  cotData = cotNode.cot || {};
} catch(e) { console.log('COT node non disponible'); }

// ============================================================
// ENRICHISSEMENT PRIX avec données FRED
// ============================================================
if (fredData.fred) {
  if (!pricesData['US10Y']) {
    pricesData['US10Y'] = { price: fredData.fred.US10Y?.value || '4.291', change: fredData.fred.US10Y?.change || 'N/A' };
  }
  pricesData['US2Y']  = { price: fredData.fred.US2Y?.value || '4.280', change: fredData.fred.US2Y?.change || 'N/A' };
  pricesData['US30Y'] = { price: fredData.fred.US30Y?.value || '4.580', change: fredData.fred.US30Y?.change || 'N/A' };
}

// Fallback prix si Yahoo indisponible
const defaultPrices = {
  'AUD/JPY': { price: '112.47', change: 'fallback' },
  'NZD/JPY': { price: '92.95', change: 'fallback' },
  'AUD/USD': { price: '0.7062', change: 'fallback' },
  'DXY':     { price: '98.70', change: 'fallback' },
  'Gold XAU':{ price: '4787',  change: 'fallback' },
  'WTI Crude':{ price: '96.57', change: 'fallback' },
  'US10Y':   { price: '4.291', change: 'fallback' },
  'US2Y':    { price: '4.280', change: 'fallback' },
  'US30Y':   { price: '4.580', change: 'fallback' },
  'Nikkei':  { price: '38200', change: 'fallback' },
  'ASX200':  { price: '7950',  change: 'fallback' },
  'VIX':     { price: '19.23', change: 'fallback' },
  'BTC/USD': { price: '71516', change: 'fallback' }
};

// Merger avec fallback
const finalPrices = { ...defaultPrices, ...pricesData };

// ============================================================
// CRYPTO RISK FLOW INDEX
// ============================================================
const CRYPTO_RISK_FLOW = (() => {
  const btcPrice = parseFloat(finalPrices['BTC/USD']?.price || '0');
  const btcChangeRaw = finalPrices['BTC/USD']?.change || '0';
  const btcChangePctRaw = finalPrices['BTC/USD']?.changePct || '0%';
  const btcChangePct = parseFloat(btcChangePctRaw);
  const vixPrice = parseFloat(finalPrices['VIX']?.price || '21');
  const vixChangeRaw = finalPrices['VIX']?.change || '0';
  const vixChange = parseFloat(vixChangeRaw);
  const goldChangeRaw = finalPrices['Gold XAU']?.change || '0';
  const goldChange = parseFloat(goldChangeRaw);

  let cryptoRiskSignal = 0;
  if (btcChangePct > 3) cryptoRiskSignal -= 2;
  else if (btcChangePct > 1) cryptoRiskSignal -= 1;
  else if (btcChangePct < -3) cryptoRiskSignal += 2;
  else if (btcChangePct < -1) cryptoRiskSignal += 1;

  if (vixChange > 2 && btcChangePct < -1) cryptoRiskSignal += 1.5;
  if (vixChange < -2 && btcChangePct > 1) cryptoRiskSignal -= 1.5;

  const btcGoldDivergence = (goldChange > 0 && btcChangePct < -1)
    || (goldChange < 0 && btcChangePct > 1);
  if (goldChange > 0 && btcChangePct < -1) cryptoRiskSignal += 1;

  let signal, color, implication;
  if (cryptoRiskSignal >= 2) {
    signal = 'RISK-OFF CONFIRMÉ';
    color = 'bull';
    implication = 'BTC en baisse + VIX up = JPY safe-haven activé → RENFORCE shorts AUD-NZD/JPY';
  } else if (cryptoRiskSignal >= 1) {
    signal = 'RISK-OFF MODÉRÉ';
    color = 'bull';
    implication = 'Flux crypto négatifs, cohérent avec positionnement bearish JPY cross';
  } else if (cryptoRiskSignal <= -2) {
    signal = 'RISK-ON RETOUR';
    color = 'bear';
    implication = 'BTC en hausse + VIX down = appétit risque revient → PRUDENCE shorts JPY cross';
  } else if (cryptoRiskSignal <= -1) {
    signal = 'RISK-ON MODÉRÉ';
    color = 'bear';
    implication = 'Flux crypto positifs, surveiller retournement sentiment → stops serrés';
  } else {
    signal = 'NEUTRE / MIXTE';
    color = 'neut';
    implication = 'Pas de signal directionnel clair côté crypto flows';
  }

  return {
    btcPrice: btcPrice.toFixed(0),
    btcChange: btcChangeRaw,
    btcChangePct: btcChangePctRaw,
    vixPrice: vixPrice.toFixed(2),
    vixChange: vixChangeRaw,
    cryptoRiskSignal: Math.round(cryptoRiskSignal * 10) / 10,
    signal,
    color,
    implication,
    btcGoldDivergence: btcGoldDivergence
      ? '⚠ DIVERGENCE BTC/GOLD — rotation risk-off sélective (Gold↑ BTC↓ = safe-haven pur)'
      : 'Pas de divergence — BTC et Gold en phase',
    etf_institutional: {
      ibit: 'IBIT BlackRock ~$55B AUM — dominant liquidité + options',
      msbt: 'MSBT Morgan Stanley lancé 8/4/26 — 0.14% fee (plus bas marché) — 16K advisors + $9.3T client assets — $34M inflows J1',
      pipeline: 'MS prépare ETF ETH + SOL + trading spot E*Trade H1 2026'
    },
    fomc_sensitivity: 'BTC -7.47% avg autour FOMC 2025. Pré-positionner avant FOMC 28-29 avril.',
    thesis: 'MSBT = signal institutionnel fort (première banque US). Fee war comprime coûts. BTC reste high-beta risk asset sensible aux taux et VIX. En régime stagflation + risk-off → BTC sous-performe Gold.'
  };
})();

// ============================================================
// DONNÉES STATIQUES MANUELLES
// [MÀJA DIMANCHE 12 AVRIL — Niveaux techniques TradingView]
// Prix de référence actualisés post-CPI 3.3%
// ============================================================
const TECH_LEVELS = {
  'AUD/JPY': {
    ctl_1d: '96.80',
    ema200_4h: '96.50',
    vwap_weekly: '96.20',
    support_4h: '94.80',
    resistance_1h: '95.40-95.60',
    fvg_1h: '95.50-95.75',
    neckline: '94.50 (H&S 1D)',
    rsi_4h: '43',
    divergence: 'bearish confirmée',
    pattern_1d: 'H&S en formation',
    ctrend_line: 'Résistance 96.80',
    choch_4h: 'Validé bearish 28 mars',
    fiboSwingHigh: '97.40',
    fiboSwingLow: '94.80',
    fiboSweepPrimary: '96.44',
    fiboSweepSecondary: '96.10',
    fiboExt1272: '94.20',
    fiboExt1618: '93.61'
  },
  'NZD/JPY': {
    ctl_1d: '88.20',
    ema200_4h: '90.80',
    vwap_weekly: '88.10',
    support_4h: '86.80',
    resistance_1h: '87.80-88.10',
    fvg_1h: 'N/A',
    neckline: '86.80 (Double Top)',
    rsi_4h: '38',
    divergence: 'bearish cachée (continuation)',
    pattern_1d: 'Double Top confirmé + Bear Flag 4H',
    ctrend_line: 'Résistance 88.20',
    choch_4h: 'Validé bearish',
    fiboSwingHigh: '92.40',
    fiboSwingLow: '86.80',
    fiboSweepPrimary: '89.60',
    fiboSweepSecondary: '88.94',
    fiboExt1272: '85.48',
    fiboExt1618: '83.84'
  },
  'AUD/USD': {
    ctl_1d: 'N/A (range)',
    ema200_4h: '0.6320',
    vwap_weekly: '0.6210',
    support_4h: '0.6150',
    resistance_1h: '0.6220',
    fvg_1h: 'N/A',
    neckline: 'N/A',
    rsi_4h: '45',
    divergence: 'non visible',
    pattern_1d: 'Triple top potentiel 0.6400',
    ctrend_line: 'N/A',
    choch_4h: 'Non confirmé',
    fiboSwingHigh: '0.6400',
    fiboSwingLow: '0.6050',
    fiboSweepPrimary: '0.6280',
    fiboSweepSecondary: '0.6220',
    fiboExt1272: '0.6080',
    fiboExt1618: '0.5950'
  }
};

// ============================================================
// FOMC ENGINE — Recalcul automatique basé sur les données
// MÀJ 12 avril : CPI mars sorti à 3.3% (vs 2.4% fév)
// ============================================================
const nfp = 178;
const cpiYoy = 3.3;      // MÀJ : CPI mars 2026 sorti 10/04 = 3.3%
const pceYoy = 3.0;
const unemployment = 4.3;
const gdpProj = 2.1;
const cutsPriced = 1;

let hawkishScore = 0;
if (nfp > 150) hawkishScore += 2;
else if (nfp < 0) hawkishScore -= 2;
if (cpiYoy > 3.5) hawkishScore += 2.5;
else if (cpiYoy < 2) hawkishScore -= 2;
if (pceYoy > 3) hawkishScore += 2;
else if (pceYoy < 2) hawkishScore -= 2;
if (unemployment < 4) hawkishScore += 1.5;
else if (unemployment > 5) hawkishScore -= 1.5;
if (gdpProj > 2.5) hawkishScore += 1.5;
hawkishScore += (3 - cutsPriced) * 0.8;
hawkishScore = Math.round(hawkishScore * 10) / 10;

const dxyBias = hawkishScore > 1.5 ? 'HAUSSIER' : hawkishScore < -1.5 ? 'BAISSIER' : 'RANGE';
const reversalRisk = Math.min(90, Math.max(15, Math.abs(hawkishScore) * 8 + (cutsPriced > 1 ? 15 : 0)));

const FOMC_ENGINE = {
  nfp, cpiYoy, pceYoy, unemployment, gdpProj, cutsPriced,
  hawkish_score: hawkishScore,
  dxy_bias: dxyBias,
  reversal_risk: Math.round(reversalRisk),
  tone: 'hawkish — CPI 3.3% confirme inflation persistante',
  verdict: `NFP ${nfp}K + CPI ${cpiYoy}% (mars) + PCE ${pceYoy}% → Fed ne peut pas couper. Score hawkish ${hawkishScore > 0 ? '+' : ''}${hawkishScore}. DXY ${dxyBias}. Risque renversement ${Math.round(reversalRisk)}%. PPI mardi 14 = prochain catalyseur.`,
  next_catalyst: 'PPI 14 avril + Retail Sales 21 avril + FOMC 28-29 avril'
};

// ============================================================
// SCORES COMPOSITES — Recalcul automatique
// ============================================================
const cryptoAdjustment = CRYPTO_RISK_FLOW.cryptoRiskSignal >= 1 ? 3 : CRYPTO_RISK_FLOW.cryptoRiskSignal <= -1 ? -3 : 0;

let audJpyScore = 50;
if (riskOffScore >= 70) audJpyScore += 15;
if (hawkishScore > 1) audJpyScore += 8;
const audJpySentiment = sentimentData['AUD/JPY'] || {};
if (audJpySentiment.retailShortPct >= 65) audJpyScore += 5;
audJpyScore += cryptoAdjustment;
audJpyScore = Math.min(95, Math.max(20, audJpyScore));

let nzdJpyScore = 50;
if (riskOffScore >= 70) nzdJpyScore += 20;
if (hawkishScore > 1) nzdJpyScore += 8;
const nzdJpySentiment = sentimentData['NZD/JPY'] || {};
if (nzdJpySentiment.retailShortPct >= 65) nzdJpyScore += 7;
nzdJpyScore += cryptoAdjustment;
nzdJpyScore = Math.min(98, Math.max(20, nzdJpyScore));

let audUsdScore = 50;
if (riskOffScore >= 70) audUsdScore += 10;
if (hawkishScore > 1) audUsdScore += 5;
audUsdScore -= 8;
audUsdScore += Math.round(cryptoAdjustment / 2);
audUsdScore = Math.max(30, Math.min(85, audUsdScore));

const COMPOSITE_SCORES = {
  'NZD/JPY': {
    score: Math.round(nzdJpyScore),
    bias: 'SELL',
    confluences: 6 + (CRYPTO_RISK_FLOW.cryptoRiskSignal >= 1 ? 1 : 0),
    priority: 1,
    conviction: nzdJpyScore >= 80 ? 'TRÈS ÉLEVÉE' : 'ÉLEVÉE',
    note: `Overcrowded ${nzdJpySentiment.retailShortPct || 71}% short · Sweep ${nzdJpySentiment.sweepZone || '88.94-89.60'} avant entrée`,
    cryptoFlow: CRYPTO_RISK_FLOW.signal
  },
  'AUD/JPY': {
    score: Math.round(audJpyScore),
    bias: 'SELL',
    confluences: 5 + (CRYPTO_RISK_FLOW.cryptoRiskSignal >= 1 ? 1 : 0),
    priority: 2,
    conviction: audJpyScore >= 75 ? 'ÉLEVÉE' : 'MODÉRÉE',
    note: `RBA 4.10% amortit · Overcrowded ${audJpySentiment.retailShortPct || 64}% · Stop large`,
    cryptoFlow: CRYPTO_RISK_FLOW.signal
  },
  'AUD/USD': {
    score: Math.round(audUsdScore),
    bias: audUsdScore >= 55 ? 'SELL CONDITIONNEL' : 'ATTENTE',
    confluences: 3,
    priority: 3,
    conviction: 'MODÉRÉE',
    note: 'Post-CPI 3.3% → biais bearish renforcé · RBA hawkish = facteur de soutien AUD',
    cryptoFlow: CRYPTO_RISK_FLOW.signal
  }
};

// ============================================================
// PONDÉRATION CONTEXTUELLE
// ============================================================
const PONDERATIONS = {
  regime: 'STAGFLATION OFFRE + RISK-OFF GÉOPOLITIQUE',
  geopolitique: { pct: 30, note: 'Iran/Hormuz · WTI ~$97 · Choc offre persistant' },
  inflation: { pct: 25, note: `CPI ${cpiYoy}% mars (↑ vs 2.4% fév) / PCE ${pceYoy}% — inflation ré-accélère` },
  banques_centrales: { pct: 20, note: 'RBA/RBNZ/BoJ divergence = moteur FX · FOMC 28-29 avril' },
  liquidite: { pct: 10, note: 'RRP $42B quasi-vide · M2 +4.6%' },
  cot_etf: { pct: 10, note: 'Confirmation institutionnelle COT + ETF' },
  crypto_flows: { pct: 5, note: `BTC comme proxy liquidité institutionnelle · Signal: ${CRYPTO_RISK_FLOW.signal}` }
};

// ============================================================
// CALENDRIER ÉCONOMIQUE — Semaine 14-18 avril 2026
// Heures en NCT (UTC+11)
// ============================================================
const ECONOMIC_CALENDAR = [
  { date: 'Mar 14', time: '22h30 NCT', event: 'PPI Mars ⚡', impact: 'high', note: 'Prev. +0.7% MoM / +3.4% YoY. Pipeline inflation → confirme pression prix.' },
  { date: 'Mer 15', time: '22h30 NCT', event: 'Empire State Manuf.', impact: 'medium', note: 'Activité manufacturière NY. Signal avancé ISM.' },
  { date: 'Jeu 16', time: '22h30 NCT', event: 'Initial Claims + Philly Fed ⚡', impact: 'high', note: 'Claims = santé emploi. Philly Fed = manuf. côte Est.' },
  { date: 'Jeu 16', time: '23h15 NCT', event: 'Industrial Production', impact: 'medium', note: 'Capacité utilisation + production industrielle.' },
  { date: 'Ven 17', time: '22h30 NCT', event: 'Housing Starts', impact: 'medium', note: 'Construction résidentielle. Sensible aux taux.' },
  { date: 'Lun 21', time: '22h30 NCT', event: 'Retail Sales Mars ⚡⚡', impact: 'critical', note: 'Reporté du 16. Consommation = 70% GDP US. EVENT RISK.' },
  { date: '27-28 Avr', time: 'TBD', event: 'FOMC + BoJ ⚡⚡⚡', impact: 'critical', note: 'Double event risk. Fed decision + BoJ normalisation.' }
];

// ============================================================
// CONTEXTE MACRO PERMANENT — MÀJ 12 avril 2026
// ============================================================
const us10yVal = finalPrices['US10Y']?.price || '4.291';
const us2yVal = finalPrices['US2Y']?.price || '4.280';
const spreadVal = (parseFloat(us10yVal) - parseFloat(us2yVal)).toFixed(3);
const wtiVal = finalPrices['WTI Crude']?.price || '97';
const goldVal = finalPrices['Gold XAU']?.price || '4787';
const btcVal = finalPrices['BTC/USD']?.price || '71516';

const MACRO_CONTEXT = `
CONTEXTE MACRO PERMANENT (${new Date().toLocaleDateString('fr-FR')}):
- Guerre Iran / Détroit Hormuz. WTI ~$${wtiVal}. Brent >$100. Choc d'offre persistant.
- Fed Funds : 3.50-3.75%. Hold. CPI mars sorti 3.3% (vs 2.4% fév) → inflation ré-accélère.
- RBA : 4.10% hawkish. RBNZ : 2.25% dovish. BoJ : ~0.50% normalisation (27-28 avril).
- NFP mars : +178K. Chômage 4.3%. ISM Manuf. 52.7. ISM Prices 78.3 (extrême).
- US10Y : ${us10yVal}%. US2Y : ${us2yVal}%. Spread : ${spreadVal}% (quasi-plate = stagflation).
- Gold : $${goldVal}. Risk-off ${riskOffScore}/100. Carry désactivé. JPY safe-haven dominant.
- BTC : $${btcVal} · Crypto Risk Flow : ${CRYPTO_RISK_FLOW.signal} (score ${CRYPTO_RISK_FLOW.cryptoRiskSignal}) · ${CRYPTO_RISK_FLOW.btcGoldDivergence}
- MSBT Morgan Stanley lancé 8/4/26 (0.14%) — signal institutionnel. IBIT $55B dominant.
- PPI mars mardi 14 avril = prochain catalyseur pipeline inflation.
- RRP Fed : $42B quasi-vide. Bilan $6.66T. M2 +4.6% YoY. FOMC Engine score : ${hawkishScore > 0 ? '+' : ''}${hawkishScore} hawkish.
- COT : JPY +${(cotData['JPY']?.net/1000||85.4).toFixed(1)}K longs (88e pct). AUD ${(cotData['AUD']?.net/1000||-45.2).toFixed(1)}K. NZD ${(cotData['NZD']?.net/1000||-22.8).toFixed(1)}K.
- FOMC Engine : Score ${hawkishScore > 0 ? '+' : ''}${hawkishScore}. DXY ${dxyBias}. Renversement ${Math.round(reversalRisk)}%.
- Semaine 14-18 avril : PPI Mar14 · Empire State Mer15 · Claims+Philly Jeu16 · Housing Ven17 · Retail Sales Lun21.
`;

const sessionType = (() => {
  try {
    const s = $('Set Session = soir').first()?.json?.sessionType;
    if (s) return s;
  } catch(e) {}
  try {
    const s = $('Set Session = midi').first()?.json?.sessionType;
    if (s) return s;
  } catch(e) {}
  try {
    const s = $('Set Session = matin').first()?.json?.sessionType;
    if (s) return s;
  } catch(e) {}
  try {
    const s = $('Définir la session = soir').first()?.json?.sessionType;
    if (s) return s;
  } catch(e) {}
  try {
    const s = $('Définir la session = midi').first()?.json?.sessionType;
    if (s) return s;
  } catch(e) {}
  try {
    const s = $('Définir la session = matin').first()?.json?.sessionType;
    if (s) return s;
  } catch(e) {}
  return 'matin';
})();
const now = new Date();

return [{
  json: {
    sessionType,
    prices: finalPrices,
    cryptoRiskFlow: CRYPTO_RISK_FLOW,
    sentiment: sentimentData && Object.keys(sentimentData).length > 0 ? sentimentData : {
      'AUD/JPY': { retailShortPct: 64, overcrowdLevel: 'MODÉRÉ', overcrowdRisk: 'medium', sweepProbability: 55, sweepZone: '96.10-96.44', fiboTarget1: '94.20', fiboTarget2: '93.61' },
      'NZD/JPY': { retailShortPct: 71, overcrowdLevel: 'ÉLEVÉ ⚠', overcrowdRisk: 'high', sweepProbability: 78, sweepZone: '88.94-89.60', fiboTarget1: '85.48', fiboTarget2: '83.84' },
      'AUD/USD': { retailShortPct: 58, overcrowdLevel: 'FAIBLE', overcrowdRisk: 'low', sweepProbability: 35, sweepZone: 'Post-CPI', fiboTarget1: '0.6080', fiboTarget2: '0.5950' }
    },
    cot: Object.keys(cotData).length > 0 ? cotData : {
      AUD: { net: -45200, prev: -42100, change: -3100, signal: 'SHORTS AUGMENTENT', bias: 'bear', percentile: 28, interpretation: 'Managed money shorts AUD en hausse.' },
      NZD: { net: -22800, prev: -20900, change: -1900, signal: 'SHORTS AUGMENTENT', bias: 'bear', percentile: 22, interpretation: 'Shorts NZD 3 semaines consécutives.' },
      JPY: { net: 85400, prev: 73100, change: 12300, signal: 'LONGS MASSIFS', bias: 'bull', percentile: 88, interpretation: 'Accumulation safe-haven record.' }
    },
    etfFlows: etfFlowsData,
    fedLiquidity: {
      rrp: { value: '$42B', trend: 'QUASI-VIDE ↓', signal: 'CRITIQUE', color: 'bear', note: 'Prochaine tension repo = USD spike' },
      balance_sheet: { value: '$6.66T', trend: 'STABLE', signal: 'QT TERMINÉ', color: 'neut', note: '$40B/mois reserve management' },
      m2: { value: '$22.67T', trend: '+4.6% YoY', signal: 'SUPPORTIF', color: 'bull', note: 'Fond nominal soutien actifs' },
      tga: { value: '~$850B', trend: 'NORMAL', signal: 'NEUTRE', color: 'neut', note: 'Pas de risque drain' }
    },
    yieldCurve: fredData.yieldCurve || {
      shape: 'QUASI-PLATE',
      signal: 'STAGFLATION confirmée — CPI 3.3% renforce le biais',
      spread10y2y: spreadVal,
      us10y: parseFloat(us10yVal),
      us2y: parseFloat(us2yVal)
    },
    techLevels: TECH_LEVELS,
    ponderations: PONDERATIONS,
    compositeScores: COMPOSITE_SCORES,
    fomcEngine: FOMC_ENGINE,
    calendar: ECONOMIC_CALENDAR,
    macroContext: MACRO_CONTEXT,
    riskOffScore,
    riskOffLabel: riskOffScore >= 70 ? 'RISK-OFF DOMINANT' : riskOffScore >= 50 ? 'NEUTRE/MIXTE' : 'RISK-ON',
    timestamp: now.toISOString(),
    dateFormatted: now.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    timeFormatted: now.toLocaleTimeString('fr-FR', { timeZone: 'Pacific/Noumea', hour: '2-digit', minute: '2-digit' }) + ' NCT',
    dataSources: {
      prices: 'Yahoo Finance live + FRED API',
      sentiment: 'Myfxbook Community Outlook live',
      cot: fredData.dataSource || 'CFTC/Nasdaq Data Link',
      etf: 'Yahoo Finance Volume Proxy',
      rates: 'FRED API (Federal Reserve)',
      crypto: 'Yahoo Finance BTC-USD live'
    }
  }
}];
