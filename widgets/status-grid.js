const statusGridWidget = {
  el: null,
  mirrorEl: null,
  uptimeEl: null,
  interval: 2000,
  blocks: 12,

  rows: [
    { key: 'cpu', label: 'CPU' },
    { key: 'gpu', label: 'GPU' },
    { key: 'ram', label: 'RAM' },
    { key: 'temp', label: 'TEMP' },
    { key: 'wifi', label: 'WIFI' },
  ],

  init() {
    this.el = document.getElementById('system-status');
    this.mirrorEl = document.getElementById('offline-status');
    this.uptimeEl = document.getElementById('system-uptime');
    this.el.className = 'status-grid';
    const cells = '<span class="cell cell--empty" role="img"></span>'.repeat(this.blocks);
    this.el.innerHTML = this.rows.map((row) => `
      <div class="status-row" data-metric="${row.key}">
        <span class="row-label">${row.label}</span>
        <span class="row-track">${cells}</span>
        <span class="row-value">—</span>
      </div>
    `).join('');
    this.update();
  },

  tierFor(key, value) {
    return statusTierFor(key, value);
  },

  cellClass(key, block) {
    if (!block || !(key in block)) return 'cell cell--empty';
    if (block[key] == null) return `cell cell--${statusUnavailableColor()}`;
    return `cell cell--${this.tierFor(key, block[key])}`;
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
    return { text: `${Math.round(value)}${key === 'temp' ? '°' : '%'}`, tier: this.tierFor(key, tierValue) };
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
    const end = isCurrent ? 'now' : this.formatTime(block.start + 30 * 60);
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
    const compact = days > 0
      ? `${days}d ${hours}h`
      : hours > 0
        ? `${hours}h ${minutes}m`
        : totalMinutes > 0 ? `${totalMinutes}m` : '<1m';
    const exact = [
      days ? `${days} ${days === 1 ? 'day' : 'days'}` : '',
      hours ? `${hours} ${hours === 1 ? 'hour' : 'hours'}` : '',
      `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`,
    ].filter(Boolean).join(', ');
    this.uptimeEl.textContent = `Uptime ${compact}`;
    this.uptimeEl.title = `Device uptime: ${exact}`;
  },

  render(data) {
    const blocks = data.blocks || [];
    const latest = data.latest || {};
    const current = blocks[this.blocks - 1];
    this.rows.forEach((row) => {
      const rowEl = this.el.querySelector(`[data-metric="${row.key}"]`);
      rowEl.querySelectorAll('.cell').forEach((cell, index) => {
        const isCurrent = index === this.blocks - 1;
        const label = this.blockLabel(row, blocks[index], isCurrent);
        cell.className = this.cellClass(row.key, blocks[index]);
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
