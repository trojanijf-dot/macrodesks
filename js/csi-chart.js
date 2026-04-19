/* ============================================================
   MACRODESK — CSI CHART V3.7
   Classe DualCSIChart : graphique Base 100 + %Change avec D3
   
   USAGE :
   const chart = new DualCSIChart({
     baseSvgSelector: '#csiSvgBase',
     pctSvgSelector: '#csiSvgPct',
     // ... autres selectors
   });
   chart.setData(timeSeriesData);  // timeSeries du macrodata.json
   ============================================================ */

(function(global) {
  'use strict';

  const CURRENCIES = ['AUD', 'NZD', 'JPY', 'USD', 'EUR', 'GBP', 'CHF', 'CAD'];
  
  const COLORS = {
    AUD: '#f5a623', NZD: '#b968e8', JPY: '#a8b2c0', USD: '#ff4d6d',
    EUR: '#4a9eff', GBP: '#1fd388', CHF: '#c89b3d', CAD: '#e85d9a'
  };

  const DIVERGENCE_META = {
    'BEARISH_MOMENTUM_BREAK': { shortLabel: 'BMB', color: '#ff4d6d', priority: 3, badgeClass: 'csi-div-badge--p3' },
    'BULLISH_MOMENTUM_BREAK': { shortLabel: 'BullMB', color: '#1fd388', priority: 3, badgeClass: 'csi-div-badge--bullp3' },
    'BEARISH_SHORT_TERM': { shortLabel: 'BST', color: '#f5a623', priority: 2, badgeClass: 'csi-div-badge--p2' },
    'BULLISH_SHORT_TERM': { shortLabel: 'BullST', color: '#4a9eff', priority: 2, badgeClass: 'csi-div-badge--p2bull' },
    'SHORT_TERM_FADE': { shortLabel: 'Fade', color: '#ffd54f', priority: 1, badgeClass: 'csi-div-badge--p1' },
    'SHORT_TERM_SURGE': { shortLabel: 'Surge', color: '#b968e8', priority: 1, badgeClass: 'csi-div-badge--p1surge' }
  };

  class DualCSIChart {
    constructor() {
      this.currentTF = '1H';
      this.activeCurrencies = new Set(CURRENCIES);
      this.timeSeriesData = null;
      this.currentCurrencies = null; // state actuel des forces (pour divergences)
      this.lastUpdate = null;
      
      this.svgBase = d3.select('#csiSvgBase');
      this.svgPct = d3.select('#csiSvgPct');
      this.wrapper = document.getElementById('csiWrapper');
      this.tooltip = d3.select('#csiTooltip');
      
      this.xDomainFull = null;
      this.xDomain = null;
      this.zoomLevel = 1;
      
      this.yDomainBase = null;
      this.yDomainBaseDefault = [0, 100];
      this.yDomainPct = null;
      this.yDomainPctAuto = null;
      
      this.panYState = null;
      this.panXYState = null;
      
      this.initialized = false;
    }

    init() {
      if (this.initialized) return;
      this.bindControls();
      this.setupYAxisInteractions();
      this.setupGlobalPanHandlers();
      this.resizeObserver = new ResizeObserver(() => this.render());
      const section = document.querySelector('.csi-chart-section--base100');
      if (section) this.resizeObserver.observe(section);
      this.initialized = true;
    }

    // Appelée par macrodesk-core.js quand les données sont chargées
    setData(forceDevises) {
      if (!forceDevises || !forceDevises.timeSeries) {
        console.warn('[CSI] Pas de timeSeries dans forceDevises');
        return;
      }
      this.timeSeriesData = forceDevises.timeSeries;
      this.currentCurrencies = forceDevises.currencies || {};
      this.lastUpdate = forceDevises.last_update;
      
      if (!this.initialized) this.init();
      this.resetAllZoom();
    }

    bindControls() {
      document.querySelectorAll('.csi-tf-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.csi-tf-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.currentTF = btn.dataset.tf;
          this.resetAllZoom();
        });
      });
      
      const zoomIn = document.getElementById('csiZoomIn');
      const zoomOut = document.getElementById('csiZoomOut');
      const zoomReset = document.getElementById('csiZoomReset');
      if (zoomIn) zoomIn.addEventListener('click', () => this.applyZoomX(0.75));
      if (zoomOut) zoomOut.addEventListener('click', () => this.applyZoomX(1.33));
      if (zoomReset) zoomReset.addEventListener('click', () => this.resetAllZoom());
      
      const badgeBase = document.getElementById('csiYBadgeBase');
      const badgePct = document.getElementById('csiYBadgePct');
      if (badgeBase) badgeBase.addEventListener('click', () => { this.yDomainBase = null; this.render(); });
      if (badgePct) badgePct.addEventListener('click', () => { this.yDomainPct = null; this.render(); });
    }

    setupYAxisInteractions() {
      const self = this;
      
      const setupYAxis = (elementId, chartKey) => {
        const el = document.getElementById(elementId);
        if (!el) return;
        
        el.addEventListener('mousedown', (event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          
          const startDomain = chartKey === 'base'
            ? [...(self.yDomainBase || self.yDomainBaseDefault)]
            : [...(self.yDomainPct || self.yDomainPctAuto || [-1, 1])];
          
          self.panYState = {
            chartKey: chartKey,
            startY: event.clientY,
            startDomain: startDomain,
            chartHeight: chartKey === 'base' ? self.baseHeight : self.pctHeight
          };
          
          document.body.classList.add('dragging-y');
          self.tooltip.classed('visible', false);
        });
        
        el.addEventListener('dblclick', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (chartKey === 'base') self.yDomainBase = null;
          else self.yDomainPct = null;
          self.render();
        });
        
        el.addEventListener('wheel', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const factor = event.deltaY > 0 ? 1.25 : 0.8;
          self.applyYZoom(chartKey, factor);
        });
      };
      
      setupYAxis('csiYAxisBase', 'base');
      setupYAxis('csiYAxisPct', 'pct');
    }

    setupGlobalPanHandlers() {
      const self = this;
      
      document.addEventListener('mousemove', (event) => {
        if (self.panYState) {
          const state = self.panYState;
          const dy = event.clientY - state.startY;
          const factor = Math.exp(-dy / state.chartHeight * 2.5);
          const clampedFactor = Math.max(0.1, Math.min(10, factor));
          
          const [d0, d1] = state.startDomain;
          const center = (d0 + d1) / 2;
          const range = d1 - d0;
          const newRange = range * clampedFactor;
          
          let newY0 = center - newRange / 2;
          let newY1 = center + newRange / 2;
          
          if (state.chartKey === 'base') {
            if (newY1 - newY0 < 3) return;
            if (newY1 - newY0 > 300) return;
            self.yDomainBase = [newY0, newY1];
          } else {
            if (Math.abs(newY1 - newY0) < 0.01) return;
            if (Math.abs(newY1 - newY0) > 50) return;
            self.yDomainPct = [newY0, newY1];
          }
          
          self.render();
          return;
        }
        
        if (self.panXYState) {
          const state = self.panXYState;
          const dx = event.clientX - state.startX;
          const dy = event.clientY - state.startY;
          
          const msPerPx = (state.startXDomain[1].getTime() - state.startXDomain[0].getTime()) / state.chartWidth;
          const deltaMs = -dx * msPerPx;
          
          let newXD0 = new Date(state.startXDomain[0].getTime() + deltaMs);
          let newXD1 = new Date(state.startXDomain[1].getTime() + deltaMs);
          const fullStart = self.xDomainFull[0].getTime();
          const fullEnd = self.xDomainFull[1].getTime();
          
          if (newXD0.getTime() < fullStart) {
            newXD0 = new Date(fullStart);
            newXD1 = new Date(fullStart + (state.startXDomain[1] - state.startXDomain[0]));
          }
          if (newXD1.getTime() > fullEnd) {
            newXD1 = new Date(fullEnd);
            newXD0 = new Date(fullEnd - (state.startXDomain[1] - state.startXDomain[0]));
          }
          
          self.xDomain = [newXD0, newXD1];
          
          const yUnitsPerPx = (state.startYDomain[1] - state.startYDomain[0]) / state.chartHeight;
          const deltaY = dy * yUnitsPerPx;
          
          const newYD0 = state.startYDomain[0] + deltaY;
          const newYD1 = state.startYDomain[1] + deltaY;
          
          if (state.sourceChart === 'base') {
            self.yDomainBase = [newYD0, newYD1];
          } else {
            self.yDomainPct = [newYD0, newYD1];
          }
          
          self.render();
          return;
        }
      });
      
      document.addEventListener('mouseup', () => {
        if (self.panYState) {
          self.panYState = null;
          document.body.classList.remove('dragging-y');
        }
        if (self.panXYState) {
          self.panXYState = null;
          document.body.classList.remove('dragging-xy');
          self.svgBase.node().classList.remove('panning');
          self.svgPct.node().classList.remove('panning');
        }
      });
    }

    applyYZoom(chartKey, factor) {
      const current = chartKey === 'base'
        ? (this.yDomainBase || this.yDomainBaseDefault)
        : (this.yDomainPct || this.yDomainPctAuto || [-1, 1]);
      
      const [d0, d1] = current;
      const center = (d0 + d1) / 2;
      const range = d1 - d0;
      const newRange = range * factor;
      
      let newY0 = center - newRange / 2;
      let newY1 = center + newRange / 2;
      
      if (chartKey === 'base') {
        if (newY1 - newY0 < 3) return;
        if (newY1 - newY0 > 300) return;
        this.yDomainBase = [newY0, newY1];
      } else {
        if (Math.abs(newY1 - newY0) < 0.01) return;
        if (Math.abs(newY1 - newY0) > 50) return;
        this.yDomainPct = [newY0, newY1];
      }
      
      this.render();
    }

    getData() {
      if (!this.timeSeriesData) return [];
      return this.timeSeriesData[this.currentTF] || [];
    }

    getVisibleData() {
      const all = this.getData();
      if (!this.xDomain) return all;
      const [d0, d1] = this.xDomain;
      return all.filter(d => {
        const date = new Date(d.t * 1000);
        return date >= d0 && date <= d1;
      });
    }

    resetAllZoom() {
      const data = this.getData();
      if (data.length > 0) {
        this.xDomainFull = d3.extent(data, d => new Date(d.t * 1000));
        this.xDomain = [...this.xDomainFull];
        this.zoomLevel = 1;
      }
      this.yDomainBase = null;
      this.yDomainPct = null;
      this.render();
    }

    applyZoomX(factor, centerDate = null) {
      if (!this.xDomain) return;
      const [d0, d1] = this.xDomain;
      const center = centerDate || new Date((d0.getTime() + d1.getTime()) / 2);
      const newRange = (d1.getTime() - d0.getTime()) * factor;
      
      let newD0 = new Date(center.getTime() - newRange * ((center - d0) / (d1 - d0)));
      let newD1 = new Date(newD0.getTime() + newRange);
      
      const fullStart = this.xDomainFull[0].getTime();
      const fullEnd = this.xDomainFull[1].getTime();
      
      if (newD0.getTime() < fullStart) { newD0 = new Date(fullStart); newD1 = new Date(Math.min(fullStart + newRange, fullEnd)); }
      if (newD1.getTime() > fullEnd) { newD1 = new Date(fullEnd); newD0 = new Date(Math.max(fullEnd - newRange, fullStart)); }
      
      const fullSpan = fullEnd - fullStart;
      const minSpan = fullSpan * 0.02;
      if (newD1 - newD0 < minSpan) return;
      if (newD1 - newD0 > fullSpan) { newD0 = new Date(fullStart); newD1 = new Date(fullEnd); }
      
      this.xDomain = [newD0, newD1];
      this.zoomLevel = fullSpan / (newD1 - newD0);
      this.render();
    }

    render() {
      const data = this.getData();
      if (data.length === 0) return;
      
      if (!this.xDomain) {
        this.xDomainFull = d3.extent(data, d => new Date(d.t * 1000));
        this.xDomain = [...this.xDomainFull];
      }
      
      this.renderBaseChart(data);
      this.renderPctChart(data);
      this.setupXInteractions(data);
      if (data[data.length - 1]) this.renderLegend(data[data.length - 1]);
      this.renderCurrentDivergences();
      this.updateMeta(data.length);
      this.updateZoomIndicator();
      this.updateYBadges();
    }

    updateZoomIndicator() {
      const indicator = document.getElementById('csiZoomLevel');
      if (indicator) {
        const pct = Math.round(this.zoomLevel * 100);
        indicator.textContent = pct + '%';
        indicator.style.color = pct > 100 ? 'var(--md-blue)' : 'var(--md-text-1)';
      }
    }

    updateYBadges() {
      const b1 = document.getElementById('csiYBadgeBase');
      const b2 = document.getElementById('csiYBadgePct');
      if (b1) b1.classList.toggle('visible', !!this.yDomainBase);
      if (b2) b2.classList.toggle('visible', !!this.yDomainPct);
    }

    renderBaseChart(allData) {
      const svg = this.svgBase;
      svg.selectAll('*').remove();
      
      const container = svg.node().parentNode;
      const rect = container.getBoundingClientRect();
      const totalWidth = rect.width;
      const totalHeight = rect.height;
      if (totalWidth < 50 || totalHeight < 50) return;
      
      svg.attr('viewBox', `0 0 ${totalWidth} ${totalHeight}`).attr('width', totalWidth).attr('height', totalHeight);
      
      const margin = { top: 10, right: 85, bottom: 25, left: 45 };
      const width = totalWidth - margin.left - margin.right;
      const height = totalHeight - margin.top - margin.bottom;
      
      const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
      
      svg.append('defs').append('clipPath')
        .attr('id', 'clipBase')
        .append('rect').attr('class', 'csi-clip-rect')
        .attr('width', width).attr('height', height);
      
      const x = d3.scaleTime().domain(this.xDomain).range([0, width]);
      const yDomain = this.yDomainBase || this.yDomainBaseDefault;
      const y = d3.scaleLinear().domain(yDomain).range([height, 0]);
      
      this.baseG = g; this.baseX = x; this.baseY = y;
      this.baseWidth = width; this.baseHeight = height;
      this.baseMargin = margin; this.baseYDomain = yDomain;
      
      if (yDomain[1] > 70) {
        g.append('rect').attr('class', 'csi-zone-strong')
          .attr('x', 0).attr('y', y(Math.min(yDomain[1], 100)))
          .attr('width', width)
          .attr('height', y(Math.max(yDomain[0], 70)) - y(Math.min(yDomain[1], 100)));
      }
      if (yDomain[0] < 30) {
        g.append('rect').attr('class', 'csi-zone-weak')
          .attr('x', 0).attr('y', y(Math.min(yDomain[1], 30)))
          .attr('width', width)
          .attr('height', y(Math.max(yDomain[0], 0)) - y(Math.min(yDomain[1], 30)));
      }
      
      g.append('g').attr('class', 'csi-grid')
        .call(d3.axisLeft(y).ticks(8).tickSize(-width).tickFormat(''))
        .selectAll('text').remove();
      
      [30, 50, 70].forEach(v => {
        if (v < yDomain[0] || v > yDomain[1]) return;
        g.append('line').attr('class', v === 50 ? 'csi-baseline' : 'csi-threshold')
          .attr('x1', 0).attr('x2', width).attr('y1', y(v)).attr('y2', y(v));
        g.append('text').attr('class', 'csi-threshold-label')
          .attr('x', -6).attr('y', y(v) + 3).attr('text-anchor', 'end').text(v);
      });
      
      g.append('g').attr('class', 'csi-axis')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(Math.min(8, Math.floor(width / 80))).tickFormat(d3.timeFormat('%d/%m %Hh')));
      g.append('g').attr('class', 'csi-axis').call(d3.axisLeft(y).ticks(8));
      
      const linesG = g.append('g').attr('clip-path', 'url(#clipBase)');
      
      const line = d3.line()
        .x(d => x(new Date(d.t * 1000)))
        .y(d => y(d.score))
        .curve(d3.curveCatmullRom.alpha(0.7));
      
      CURRENCIES.forEach(currency => {
        const series = allData.map(d => ({ t: d.t, score: d.scores[currency] }));
        const isActive = this.activeCurrencies.has(currency);
        linesG.append('path')
          .datum(series)
          .attr('class', `csi-line csi-line-base--${currency} ${!isActive ? 'dimmed' : ''}`)
          .attr('stroke', COLORS[currency])
          .attr('d', line);
      });
      
      const visibleData = this.getVisibleData();
      if (visibleData.length > 0) {
        const lastData = visibleData[visibleData.length - 1];
        const labels = CURRENCIES
          .filter(c => this.activeCurrencies.has(c) && lastData.scores[c] >= yDomain[0] && lastData.scores[c] <= yDomain[1])
          .map(c => ({ code: c, score: lastData.scores[c] }))
          .sort((a, b) => b.score - a.score);
        
        const minGap = 13;
        labels.forEach(l => l.displayY = y(l.score));
        for (let iter = 0; iter < 10; iter++) {
          for (let i = 1; i < labels.length; i++) {
            if (labels[i].displayY - labels[i-1].displayY < minGap) {
              labels[i].displayY = labels[i-1].displayY + minGap;
            }
          }
        }
        
        labels.forEach(l => {
          const targetY = y(l.score);
          const labelG = g.append('g').attr('transform', `translate(${width + 3}, ${l.displayY})`);
          if (Math.abs(l.displayY - targetY) > 2) {
            g.append('line').attr('x1', width).attr('x2', width + 3)
              .attr('y1', targetY).attr('y2', l.displayY)
              .attr('stroke', COLORS[l.code]).attr('stroke-width', 0.8).attr('opacity', 0.5);
          }
          labelG.append('rect').attr('x', 0).attr('y', -6).attr('width', 45).attr('height', 12)
            .attr('rx', 2).attr('ry', 2).attr('fill', COLORS[l.code]);
          labelG.append('text').attr('class', 'csi-currency-label')
            .attr('x', 13).attr('y', 3).attr('text-anchor', 'middle').attr('fill', '#0a0e17').text(l.code);
          labelG.append('text').attr('class', 'csi-currency-label')
            .attr('x', 26).attr('y', 3).attr('text-anchor', 'start').attr('fill', '#0a0e17').text(Math.round(l.score));
        });
        
        const nowDate = new Date(lastData.t * 1000);
        if (nowDate >= this.xDomain[0] && nowDate <= this.xDomain[1]) {
          const nowX = x(nowDate);
          g.append('line').attr('class', 'csi-current-line')
            .attr('x1', nowX).attr('x2', nowX).attr('y1', 0).attr('y2', height);
          g.append('text').attr('class', 'csi-current-label')
            .attr('x', nowX).attr('y', -1).attr('text-anchor', 'middle').text('NOW');
        }
      }
      
      allData.forEach(d => {
        if (!d.divergences) return;
        const date = new Date(d.t * 1000);
        if (date < this.xDomain[0] || date > this.xDomain[1]) return;
        d.divergences.forEach(div => {
          if (!this.activeCurrencies.has(div.currency)) return;
          const meta = DIVERGENCE_META[div.type];
          if (!meta) return;
          const score = d.scores[div.currency];
          if (score < yDomain[0] || score > yDomain[1]) return;
          const cx = x(date); const cy = y(score);
          const size = div.priority === 3 ? 6 : div.priority === 2 ? 5 : 4;
          const marker = linesG.append('g')
            .attr('class', `csi-div-marker priority-${div.priority}`)
            .attr('transform', `translate(${cx},${cy})`);
          if (div.priority === 3) {
            marker.append('circle').attr('r', size + 3).attr('fill', meta.color).attr('opacity', 0.2);
          }
          const isBullish = div.type.includes('BULLISH') || div.type.includes('SURGE');
          const path = isBullish
            ? `M 0 ${-size} L ${size} ${size * 0.7} L ${-size} ${size * 0.7} Z`
            : `M 0 ${size} L ${size} ${-size * 0.7} L ${-size} ${-size * 0.7} Z`;
          marker.append('path').attr('d', path).attr('fill', meta.color)
            .attr('stroke', '#0a0e17').attr('stroke-width', 1);
          marker.append('title').text(`${div.currency} · ${meta.shortLabel} (P${div.priority})`);
        });
      });
    }

    renderPctChart(allData) {
      const svg = this.svgPct;
      svg.selectAll('*').remove();
      
      const container = svg.node().parentNode;
      const rect = container.getBoundingClientRect();
      const totalWidth = rect.width; const totalHeight = rect.height;
      if (totalWidth < 50 || totalHeight < 50) return;
      
      svg.attr('viewBox', `0 0 ${totalWidth} ${totalHeight}`).attr('width', totalWidth).attr('height', totalHeight);
      
      const margin = { top: 10, right: 85, bottom: 25, left: 45 };
      const width = totalWidth - margin.left - margin.right;
      const height = totalHeight - margin.top - margin.bottom;
      
      const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
      
      svg.append('defs').append('clipPath').attr('id', 'clipPct')
        .append('rect').attr('class', 'csi-clip-rect').attr('width', width).attr('height', height);
      
      const x = d3.scaleTime().domain(this.xDomain).range([0, width]);
      
      const visibleData = this.getVisibleData();
      const allPcts = [];
      (visibleData.length > 0 ? visibleData : allData).forEach(d => {
        CURRENCIES.forEach(c => { if (this.activeCurrencies.has(c)) allPcts.push(d.pctChange[c]); });
      });
      const pctAbs = Math.max(Math.abs(d3.max(allPcts) || 0.5), Math.abs(d3.min(allPcts) || -0.5)) * 1.15;
      this.yDomainPctAuto = [-pctAbs, pctAbs];
      
      const yDomain = this.yDomainPct || this.yDomainPctAuto;
      const y = d3.scaleLinear().domain(yDomain).range([height, 0]);
      
      this.pctG = g; this.pctX = x; this.pctY = y;
      this.pctWidth = width; this.pctHeight = height;
      this.pctMargin = margin; this.pctYDomain = yDomain;
      
      g.append('g').attr('class', 'csi-grid')
        .call(d3.axisLeft(y).ticks(5).tickSize(-width).tickFormat('')).selectAll('text').remove();
      
      if (0 >= yDomain[0] && 0 <= yDomain[1]) {
        g.append('line').attr('class', 'csi-baseline')
          .attr('x1', 0).attr('x2', width).attr('y1', y(0)).attr('y2', y(0));
      }
      
      g.append('g').attr('class', 'csi-axis')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(Math.min(8, Math.floor(width / 80))).tickFormat(d3.timeFormat('%d/%m %Hh')));
      g.append('g').attr('class', 'csi-axis')
        .call(d3.axisLeft(y).ticks(5).tickFormat(d => (d > 0 ? '+' : '') + d.toFixed(2) + '%'));
      
      const linesG = g.append('g').attr('clip-path', 'url(#clipPct)');
      
      const line = d3.line()
        .x(d => x(new Date(d.t * 1000)))
        .y(d => y(d.pct))
        .curve(d3.curveBasis);
      
      CURRENCIES.forEach(currency => {
        const series = allData.map(d => ({ t: d.t, pct: d.pctChange[currency] }));
        const isActive = this.activeCurrencies.has(currency);
        linesG.append('path').datum(series)
          .attr('class', `csi-line csi-line-pct--${currency} ${!isActive ? 'dimmed' : ''}`)
          .attr('stroke', COLORS[currency]).attr('d', line);
      });
      
      if (visibleData.length > 0) {
        const lastData = visibleData[visibleData.length - 1];
        const labels = CURRENCIES
          .filter(c => this.activeCurrencies.has(c) && lastData.pctChange[c] >= yDomain[0] && lastData.pctChange[c] <= yDomain[1])
          .map(c => ({ code: c, pct: lastData.pctChange[c] }))
          .sort((a, b) => b.pct - a.pct);
        
        const minGap = 13;
        labels.forEach(l => l.displayY = y(l.pct));
        for (let iter = 0; iter < 10; iter++) {
          for (let i = 1; i < labels.length; i++) {
            if (labels[i].displayY - labels[i-1].displayY < minGap) {
              labels[i].displayY = labels[i-1].displayY + minGap;
            }
          }
        }
        
        labels.forEach(l => {
          const targetY = y(l.pct);
          const labelG = g.append('g').attr('transform', `translate(${width + 3}, ${l.displayY})`);
          if (Math.abs(l.displayY - targetY) > 2) {
            g.append('line').attr('x1', width).attr('x2', width + 3)
              .attr('y1', targetY).attr('y2', l.displayY)
              .attr('stroke', COLORS[l.code]).attr('stroke-width', 0.8).attr('opacity', 0.5);
          }
          const pctText = (l.pct > 0 ? '+' : '') + l.pct.toFixed(2) + '%';
          labelG.append('rect').attr('x', 0).attr('y', -6).attr('width', 70).attr('height', 12)
            .attr('rx', 2).attr('ry', 2).attr('fill', COLORS[l.code]);
          labelG.append('text').attr('class', 'csi-currency-label')
            .attr('x', 35).attr('y', 3).attr('text-anchor', 'middle').attr('fill', '#0a0e17')
            .text(`${l.code} ${pctText}`);
        });
        
        const nowDate = new Date(lastData.t * 1000);
        if (nowDate >= this.xDomain[0] && nowDate <= this.xDomain[1]) {
          const nowX = x(nowDate);
          g.append('line').attr('class', 'csi-current-line')
            .attr('x1', nowX).attr('x2', nowX).attr('y1', 0).attr('y2', height);
        }
      }
    }

    setupXInteractions(data) {
      const crosshairBase = this.baseG.append('line').attr('class', 'csi-crosshair-x');
      const crosshairPct = this.pctG.append('line').attr('class', 'csi-crosshair-x');
      const dotsBase = this.baseG.append('g');
      const dotsPct = this.pctG.append('g');
      const timeLabel = this.baseG.append('g');
      
      const bisector = d3.bisector(d => new Date(d.t * 1000)).left;
      const self = this;
      
      const setupChartInteractions = (svg, g, x, y, width, height, chartKey) => {
        const overlay = g.append('rect')
          .attr('width', width).attr('height', height)
          .attr('fill', 'none').attr('pointer-events', 'all');
        
        overlay.on('mousemove', function(event) {
          if (self.panYState || self.panXYState) return;
          const [mx] = d3.pointer(event);
          const xDate = x.invert(mx);
          const idx = bisector(data, xDate, 1);
          const d0 = data[idx - 1] || data[0];
          const d1 = data[idx] || d0;
          const d = (xDate - new Date(d0.t * 1000) > new Date(d1.t * 1000) - xDate) ? d1 : d0;
          const cx = x(new Date(d.t * 1000));
          
          crosshairBase.attr('x1', cx).attr('x2', cx).attr('y1', 0).attr('y2', self.baseHeight).classed('active', true);
          crosshairPct.attr('x1', cx).attr('x2', cx).attr('y1', 0).attr('y2', self.pctHeight).classed('active', true);
          
          dotsBase.selectAll('*').remove(); dotsPct.selectAll('*').remove();
          
          CURRENCIES.forEach(c => {
            if (!self.activeCurrencies.has(c)) return;
            const baseScore = d.scores[c]; const pctVal = d.pctChange[c];
            if (baseScore >= self.baseYDomain[0] && baseScore <= self.baseYDomain[1]) {
              dotsBase.append('circle').attr('class', 'csi-hover-dot')
                .attr('cx', cx).attr('cy', self.baseY(baseScore)).attr('r', 3.5).attr('stroke', COLORS[c]);
            }
            if (pctVal >= self.pctYDomain[0] && pctVal <= self.pctYDomain[1]) {
              dotsPct.append('circle').attr('class', 'csi-hover-dot')
                .attr('cx', cx).attr('cy', self.pctY(pctVal)).attr('r', 3.5).attr('stroke', COLORS[c]);
            }
          });
          
          timeLabel.selectAll('*').remove();
          const timeStr = new Date(d.t * 1000).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
          const textWidth = timeStr.length * 5.5 + 10;
          timeLabel.append('rect').attr('class', 'csi-hover-time-bg')
            .attr('x', cx - textWidth / 2).attr('y', self.baseHeight - 14)
            .attr('width', textWidth).attr('height', 14).attr('rx', 2);
          timeLabel.append('text').attr('class', 'csi-hover-time-label')
            .attr('x', cx).attr('y', self.baseHeight - 3).text(timeStr);
          
          self.showTooltip(event, d);
        });
        
        overlay.on('mouseleave', () => {
          if (self.panYState || self.panXYState) return;
          crosshairBase.classed('active', false); crosshairPct.classed('active', false);
          dotsBase.selectAll('*').remove(); dotsPct.selectAll('*').remove();
          timeLabel.selectAll('*').remove();
          self.tooltip.classed('visible', false);
        });
        
        overlay.on('wheel', function(event) {
          event.preventDefault();
          const [mx] = d3.pointer(event);
          const centerDate = x.invert(mx);
          const factor = event.deltaY > 0 ? 1.2 : 0.83;
          self.applyZoomX(factor, centerDate);
        });
        
        overlay.on('mousedown', function(event) {
          if (event.button !== 0) return;
          event.preventDefault();
          const yDomain = chartKey === 'base'
            ? (self.yDomainBase || self.yDomainBaseDefault)
            : (self.yDomainPct || self.yDomainPctAuto || [-1, 1]);
          self.panXYState = {
            sourceChart: chartKey, startX: event.clientX, startY: event.clientY,
            startXDomain: [...self.xDomain], startYDomain: [...yDomain],
            chartWidth: width, chartHeight: height
          };
          document.body.classList.add('dragging-xy');
          svg.node().classList.add('panning');
          self.tooltip.classed('visible', false);
          crosshairBase.classed('active', false); crosshairPct.classed('active', false);
          dotsBase.selectAll('*').remove(); dotsPct.selectAll('*').remove();
          timeLabel.selectAll('*').remove();
        });
        
        overlay.on('dblclick', function() {
          self.resetAllZoom();
        });
      };
      
      setupChartInteractions(this.svgBase, this.baseG, this.baseX, this.baseY, this.baseWidth, this.baseHeight, 'base');
      setupChartInteractions(this.svgPct, this.pctG, this.pctX, this.pctY, this.pctWidth, this.pctHeight, 'pct');
    }

    showTooltip(event, d) {
      const date = new Date(d.t * 1000);
      const scoresSorted = CURRENCIES
        .filter(c => this.activeCurrencies.has(c))
        .map(c => ({ code: c, score: d.scores[c], pct: d.pctChange[c] }))
        .sort((a, b) => b.score - a.score);
      
      const rows = scoresSorted.map(s => {
        const pctStr = (s.pct > 0 ? '+' : '') + s.pct.toFixed(2) + '%';
        const pctClass = s.pct > 0 ? 'pos' : s.pct < 0 ? 'neg' : '';
        return `<div class="csi-tooltip__dot" style="background:${COLORS[s.code]}"></div>
          <span class="csi-tooltip__code">${s.code}</span>
          <span class="csi-tooltip__score" style="color:${COLORS[s.code]}">${Math.round(s.score)}</span>
          <span class="csi-tooltip__pct ${pctClass}">${pctStr}</span>`;
      }).join('');
      
      let divHtml = '';
      if (d.divergences && d.divergences.length > 0) {
        const divs = d.divergences.map(dv => {
          const m = DIVERGENCE_META[dv.type];
          return m ? `${dv.currency} ${m.shortLabel}` : '';
        }).filter(Boolean).join(' · ');
        divHtml = `<div class="csi-tooltip__divergences">⚠ ${divs}</div>`;
      }
      
      this.tooltip.html(`
        <div class="csi-tooltip__header">${date.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
        <div class="csi-tooltip__rows">${rows}</div>
        ${divHtml}`);
      
      const rect = this.wrapper.getBoundingClientRect();
      const tooltipWidth = 240;
      let left = event.clientX - rect.left + 15;
      if (left + tooltipWidth > rect.width) left = event.clientX - rect.left - tooltipWidth - 15;
      let top = event.clientY - rect.top + 10;
      this.tooltip.style('left', left + 'px').style('top', top + 'px').classed('visible', true);
    }

    renderLegend(lastData) {
      const container = document.getElementById('csiLegend');
      if (!container) return;
      const sorted = CURRENCIES
        .map(c => ({ code: c, score: lastData.scores[c], pct: lastData.pctChange[c] }))
        .sort((a, b) => b.score - a.score);
      
      container.innerHTML = sorted.map(s => {
        const inactive = !this.activeCurrencies.has(s.code) ? 'inactive' : '';
        const pctStr = (s.pct > 0 ? '+' : '') + s.pct.toFixed(2) + '%';
        return `<div class="csi-legend-item ${inactive}" data-currency="${s.code}">
          <div class="csi-legend-swatch" style="background:${COLORS[s.code]}"></div>
          <span class="csi-legend-code">${s.code}</span>
          <span class="csi-legend-score">${Math.round(s.score)} · ${pctStr}</span>
        </div>`;
      }).join('');
      
      container.querySelectorAll('.csi-legend-item').forEach(el => {
        el.addEventListener('click', () => {
          const c = el.dataset.currency;
          if (this.activeCurrencies.has(c)) this.activeCurrencies.delete(c);
          else this.activeCurrencies.add(c);
          this.render();
        });
      });
    }

    renderCurrentDivergences() {
      const activeDivs = [];
      Object.keys(this.currentCurrencies || {}).forEach(code => {
        const c = this.currentCurrencies[code];
        if (c.allDivergences && c.allDivergences.length > 0) {
          c.allDivergences.forEach(d => activeDivs.push({ currency: code, ...d }));
        }
      });
      activeDivs.sort((a, b) => b.priority - a.priority);
      
      const container = document.getElementById('csiDivergences');
      if (!container) return;
      
      // Update divergence count badge on tab
      const tabBadge = document.getElementById('divergenceCount');
      if (tabBadge) {
        tabBadge.textContent = activeDivs.length;
        tabBadge.style.display = activeDivs.length > 0 ? 'inline-flex' : 'none';
      }
      
      if (activeDivs.length === 0) {
        container.innerHTML = '<span style="color:var(--md-text-3);font-size:11px;font-style:italic">Aucune divergence active</span>';
        return;
      }
      
      container.innerHTML = activeDivs.map(d => {
        const m = DIVERGENCE_META[d.type];
        if (!m) return '';
        return `<span class="csi-div-badge ${m.badgeClass}">
          <strong>${d.currency}</strong> ${m.shortLabel} (P${d.priority})
        </span>`;
      }).join('');
    }

    updateMeta(pointsCount) {
      const meta = document.getElementById('csiMeta');
      if (meta && this.lastUpdate) {
        const date = new Date(this.lastUpdate);
        meta.textContent = `${pointsCount} pts · ${this.currentTF} · Maj ${date.toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
      }
    }
  }

  // Export global
  global.DualCSIChart = DualCSIChart;

})(window);
