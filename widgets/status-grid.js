const statusGridWidget = {
  el: null,
  mirrorEl: null,
  interval: 2000,
  blocks: 12,

  rows: [
    { key: 'cpu', label: 'CPU' },
    { key: 'gpu', label: 'GPU' },
    { key: 'ram', label: 'RAM' },
    { key: 'temp', label: 'TEMP' },
    { key: 'wifi', label: 'WIFI' },
  ],

  // [green<, yellow<, red<] — at/above the last value is purple
  tiers: {
    cpu: [60, 80, 94],
    gpu: [60, 80, 94],
    ram: [40, 70, 86],
    temp: [60, 80, 91],
    wifi: [20, 30, 51],
  },

  init() {
    this.el = document.getElementById('system-status');
    this.mirrorEl = document.getElementById('offline-status');
    this.el.className = 'status-grid';
    const cells = '<span class="cell cell--empty"></span>'.repeat(this.blocks);
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
    const [green, yellow, red] = this.tiers[key];
    if (value < green) return 'green';
    if (value < yellow) return 'yellow';
    if (value < red) return 'red';
    return 'purple';
  },

  cellClass(key, block) {
    if (!block || !(key in block)) return 'cell cell--empty';
    if (block[key] == null) return 'cell cell--gray';
    return `cell cell--${this.tierFor(key, block[key])}`;
  },

  formatValue(key, latest) {
    if (key === 'wifi') {
      if (!latest.online || latest.wifi == null) return { text: 'offline', tier: 'gray' };
      return { text: `${Math.round(latest.wifi)}ms`, tier: this.tierFor('wifi', latest.wifi) };
    }
    const value = latest[key];
    if (value == null) return { text: '—', tier: 'gray' };
    return { text: `${Math.round(value)}${key === 'temp' ? '°' : '%'}`, tier: this.tierFor(key, value) };
  },

  render(data) {
    const blocks = data.blocks || [];
    const latest = data.latest || {};
    this.rows.forEach((row) => {
      const rowEl = this.el.querySelector(`[data-metric="${row.key}"]`);
      rowEl.querySelectorAll('.cell').forEach((cell, index) => {
        cell.className = this.cellClass(row.key, blocks[index]);
      });
      const valueEl = rowEl.querySelector('.row-value');
      const { text, tier } = this.formatValue(row.key, latest);
      valueEl.textContent = text;
      valueEl.dataset.tier = tier;
    });
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
    } catch {
      // Keep the last-known cells and values on a failed poll.
    }
    this.syncMirror();
  },
};
