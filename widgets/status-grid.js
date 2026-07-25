function monitoringStats(key, blocks) {
  const values = (blocks || [])
    .map((block) => block && block[key])
    .filter((value) => Number.isFinite(value));
  if (!values.length) return { average: null, peak: null, available: 0 };
  return {
    average: values.reduce((total, value) => total + value, 0) / values.length,
    peak: Math.max(...values),
    available: values.length,
  };
}

function compactDuration(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const totalMinutes = Math.floor(seconds / 60);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return totalMinutes > 0 ? `${totalMinutes}m` : '<1m';
}

const statusGridWidget = {
  el: null,
  mirrorEl: null,
  uptimeEl: null,
  monitoringEl: null,
  monitoringGridEl: null,
  latestData: null,
  selectedMetric: 'cpu',
  interval: 2000,
  dockBlocks: 12,
  detailBlocks: 24,
  windowMinutes: 30,

  rows: [
    { key: 'cpu', label: 'CPU', name: 'Processor load', unit: '%' },
    { key: 'gpu', label: 'GPU', name: 'Graphics load', unit: '%' },
    { key: 'ram', label: 'RAM', name: 'Memory pressure', unit: '%' },
    { key: 'temp', label: 'TEMP', name: 'System temperature', unit: '°C' },
    { key: 'wifi', label: 'WIFI', name: 'Network latency', unit: 'ms' },
  ],

  init() {
    this.el = document.getElementById('system-status');
    this.mirrorEl = document.getElementById('offline-status');
    this.uptimeEl = document.getElementById('system-uptime');
    this.monitoringEl = document.getElementById('monitoring-screen');
    this.monitoringGridEl = document.getElementById('monitoring-grid');
    this.el.className = 'status-grid';
    const cells = '<span class="cell cell--empty" role="img"></span>'.repeat(this.dockBlocks);
    this.el.innerHTML = this.rows.map((row) => `
      <button class="status-row" type="button" data-metric="${row.key}" aria-label="Open ${row.label} monitoring">
        <span class="row-label">${row.label}</span>
        <span class="row-track">${cells}</span>
        <span class="row-value">—</span>
      </button>
    `).join('');
    this.monitoringGridEl.innerHTML = this.rows
      .map((row) => this.monitoringCard(row))
      .join('');
    this.el.addEventListener('click', (event) => {
      const row = event.target.closest('.status-row');
      if (row) this.openMonitoring(row.dataset.metric);
    });
    document.getElementById('monitoring-back').addEventListener('click', () => this.closeMonitoring());
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.monitoringEl.hidden) this.closeMonitoring();
    });
    this.update();
  },

  monitoringCard(row) {
    const cells = '<span class="monitoring-cell cell--empty" role="img"></span>'
      .repeat(this.detailBlocks);
    return `
      <article class="monitoring-card" data-monitoring-metric="${row.key}" tabindex="-1">
        <header class="monitoring-card-header">
          <div>
            <span class="monitoring-card-code">${row.label}</span>
            <h2>${row.name}</h2>
          </div>
          <div class="monitoring-current">
            <strong data-monitoring-value>—</strong>
            <span data-monitoring-state>Unavailable</span>
          </div>
        </header>
        <div class="monitoring-track">${cells}</div>
        <div class="monitoring-axis">
          <span data-monitoring-start>—</span>
          <span>6 hours ago</span>
          <span>Now</span>
        </div>
        <dl class="monitoring-stats">
          <div><dt>12H AVG</dt><dd data-monitoring-average>—</dd></div>
          <div><dt>12H PEAK</dt><dd data-monitoring-peak>—</dd></div>
          <div><dt>COVERAGE</dt><dd data-monitoring-coverage>0 / 24</dd></div>
        </dl>
      </article>
    `;
  },

  tierFor(key, value) {
    return statusTierFor(key, value);
  },

  tierLabel(tier) {
    return {
      green: 'Normal',
      yellow: 'Elevated',
      red: 'High',
      purple: 'Critical',
      gray: 'Unavailable',
    }[tier] || 'Unavailable';
  },

  cellClass(key, block, base = 'cell') {
    if (!block || !(key in block)) return `${base} cell--empty`;
    if (block[key] == null) return `${base} cell--${statusUnavailableColor()}`;
    return `${base} cell--${this.tierFor(key, block[key])}`;
  },

  formatValue(key, latest, current) {
    const currentValue = current && current[key] != null ? current[key] : null;

    if (key === 'wifi') {
      if (!latest.online || latest.wifi == null) {
        return { text: 'offline', tier: statusUnavailableColor() };
      }
      const tierValue = currentValue != null ? currentValue : latest.wifi;
      return { text: `${Math.round(latest.wifi)}ms`, tier: this.tierFor('wifi', tierValue) };
    }
    const value = latest[key];
    if (value == null) return { text: '—', tier: statusUnavailableColor() };
    const tierValue = currentValue != null ? currentValue : value;
    return {
      text: `${Math.round(value)}${key === 'temp' ? '°' : '%'}`,
      tier: this.tierFor(key, tierValue),
    };
  },

  formatBlockValue(key, value) {
    if (value == null) return '—';
    if (key === 'wifi') return `${Math.round(value)}ms`;
    return `${Math.round(value)}${key === 'temp' ? '°' : '%'}`;
  },

  formatTime(timestamp) {
    const date = new Date(timestamp * 1000);
    const pad = (value) => String(value).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  },

  blockLabel(row, block, isCurrent) {
    if (!block || block.start == null) return `${row.label} · No data`;
    const end = isCurrent
      ? 'now'
      : this.formatTime(block.start + this.windowMinutes * 60);
    const window = `${this.formatTime(block.start)}–${end}`;
    const aggregation = isCurrent ? 'average' : 'p95';
    if (!(row.key in block)) return `${row.label} · ${window} · No data`;
    if (block[row.key] == null) return `${row.label} · ${window} · Unavailable`;
    return `${row.label} · ${window} · ${aggregation} ${this.formatBlockValue(row.key, block[row.key])}`;
  },

  renderUptime(seconds) {
    if (!this.uptimeEl || !Number.isFinite(seconds)) {
      if (this.uptimeEl) {
        this.uptimeEl.textContent = 'Uptime —';
        this.uptimeEl.title = 'Device uptime unavailable';
      }
      return;
    }

    const totalMinutes = Math.floor(seconds / 60);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    const exact = [
      days ? `${days} ${days === 1 ? 'day' : 'days'}` : '',
      hours ? `${hours} ${hours === 1 ? 'hour' : 'hours'}` : '',
      `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`,
    ].filter(Boolean).join(', ');
    this.uptimeEl.textContent = `Uptime ${compactDuration(seconds)}`;
    this.uptimeEl.title = `Device uptime: ${exact}`;
  },

  render(data) {
    this.latestData = data;
    this.windowMinutes = Number.isInteger(data.window_minutes)
      ? data.window_minutes
      : 30;
    const allBlocks = (data.blocks || []).slice(-this.detailBlocks);
    const blocks = allBlocks.slice(-this.dockBlocks);
    const latest = data.latest || {};
    const current = allBlocks[allBlocks.length - 1];
    this.rows.forEach((row) => {
      const rowEl = this.el.querySelector(`[data-metric="${row.key}"]`);
      rowEl.querySelectorAll('.cell').forEach((cell, index) => {
        const block = blocks[index];
        const isCurrent = index === blocks.length - 1;
        const label = this.blockLabel(row, block, isCurrent);
        cell.className = this.cellClass(row.key, block);
        cell.classList.toggle('cell--current', isCurrent);
        cell.title = label;
        cell.setAttribute('aria-label', label);
      });
      const valueEl = rowEl.querySelector('.row-value');
      const { text, tier } = this.formatValue(row.key, latest, current);
      valueEl.textContent = text;
      valueEl.dataset.tier = tier;
    });
    this.renderUptime(data.uptime_seconds);
    this.renderMonitoring(data);
  },

  renderMonitoring(data) {
    const blocks = (data.blocks || []).slice(-this.detailBlocks);
    const latest = data.latest || {};
    const current = blocks[blocks.length - 1];
    document.getElementById('monitoring-host').textContent = data.hostname || 'Local Mac';
    document.getElementById('monitoring-uptime').textContent = compactDuration(data.uptime_seconds);
    document.getElementById('monitoring-window').textContent = `${this.windowMinutes} min`;
    const updated = data.updated_at ? new Date(data.updated_at) : new Date();
    document.getElementById('monitoring-updated').textContent = updated.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const hours = (blocks.length * this.windowMinutes) / 60;
    document.getElementById('monitoring-subtitle').textContent =
      `${blocks.length} windows · ${hours} hours · ${this.windowMinutes} min each`;

    this.rows.forEach((row) => {
      const card = this.monitoringGridEl.querySelector(`[data-monitoring-metric="${row.key}"]`);
      const formatted = this.formatValue(row.key, latest, current);
      const stats = monitoringStats(row.key, blocks);
      card.dataset.tier = formatted.tier;
      card.classList.toggle('is-selected', row.key === this.selectedMetric);
      card.querySelector('[data-monitoring-value]').textContent = formatted.text;
      card.querySelector('[data-monitoring-state]').textContent = this.tierLabel(formatted.tier);
      card.querySelector('[data-monitoring-average]').textContent =
        this.formatBlockValue(row.key, stats.average);
      card.querySelector('[data-monitoring-peak]').textContent =
        this.formatBlockValue(row.key, stats.peak);
      card.querySelector('[data-monitoring-coverage]').textContent =
        `${stats.available} / ${this.detailBlocks}`;
      card.querySelector('[data-monitoring-start]').textContent = blocks[0]
        ? this.formatTime(blocks[0].start)
        : '—';
      card.querySelectorAll('.monitoring-cell').forEach((cell, index) => {
        const block = blocks[index];
        const isCurrent = index === blocks.length - 1;
        const label = this.blockLabel(row, block, isCurrent);
        cell.className = this.cellClass(row.key, block, 'monitoring-cell');
        cell.classList.toggle('cell--current', isCurrent);
        cell.title = label;
        cell.setAttribute('aria-label', label);
      });
    });
  },

  openMonitoring(metric) {
    if (!this.rows.some((row) => row.key === metric)) return;
    this.selectedMetric = metric;
    this.monitoringEl.hidden = false;
    document.body.dataset.view = 'monitoring';
    if (this.latestData) this.renderMonitoring(this.latestData);
    const card = this.monitoringGridEl.querySelector(`[data-monitoring-metric="${metric}"]`);
    if (card) card.focus({ preventScroll: true });
  },

  closeMonitoring() {
    this.monitoringEl.hidden = true;
    delete document.body.dataset.view;
    const row = this.el.querySelector(`[data-metric="${this.selectedMetric}"]`);
    if (row) row.focus({ preventScroll: true });
  },

  syncMirror() {
    if (this.mirrorEl && this.el) {
      this.mirrorEl.className = this.el.className;
      this.mirrorEl.innerHTML = this.el.innerHTML;
    }
  },

  async update() {
    try {
      const res = await fetch('/api/history', { cache: 'no-store' });
      if (!res.ok) throw new Error(`history ${res.status}`);
      this.render(await res.json());
    } catch {}
    this.syncMirror();
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    compactDuration,
    monitoringStats,
  };
}
