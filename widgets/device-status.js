const deviceStatusWidget = {
  el: null,
  interval: 2000,
  metricKeys: ['cpu', 'gpu', 'memory', 'temperature'],

  init() {
    this.el = document.getElementById('system-status');
    this.el.innerHTML = `
      <span class="status-dot"></span>
      <div class="sys-chips">
        ${this.metricKeys.map((key) => `
          <span class="sys-chip" data-metric="${key}">
            <span class="sys-name">${this.labelFor(key)}</span>
            <span class="sys-value">—</span>
          </span>
        `).join('')}
      </div>
    `;
    this.update();
  },

  labelFor(key) {
    return { cpu: 'CPU', gpu: 'GPU', memory: 'RAM', temperature: 'TEMP' }[key];
  },

  renderMetric(key, metric) {
    const chip = this.el.querySelector(`[data-metric="${key}"]`);
    const available = metric && Number.isFinite(metric.value);
    const unit = metric?.unit || '';
    const displayValue = unit === '%'
      ? Math.floor(metric.value)
      : Math.round(metric?.value);
    chip.classList.toggle('is-unavailable', !available);
    chip.querySelector('.sys-value').textContent = available
      ? `${displayValue}${unit}`
      : '—';
  },

  setStatus(level) {
    ['healthy', 'warning', 'danger', 'critical', 'unknown'].forEach((state) => {
      this.el.classList.toggle(`device-status--${state}`, state === level);
    });
  },

  render(data) {
    this.setStatus(data.status.level);
    this.metricKeys.forEach((key) => this.renderMetric(key, data.metrics[key]));
  },

  async update() {
    try {
      const response = await fetch('/api/device', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Device API returned ${response.status}`);
      this.render(await response.json());
    } catch {
      this.setStatus('unknown');
      this.metricKeys.forEach((key) => {
        const chip = this.el.querySelector(`[data-metric="${key}"]`);
        chip.classList.add('is-unavailable');
        chip.querySelector('.sys-value').textContent = '—';
      });
    }
  },
};
