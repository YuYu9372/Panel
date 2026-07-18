const deviceStatusWidget = {
  el: null,
  interval: 2000,
  metricKeys: ['cpu', 'gpu', 'memory', 'temperature'],

  init() {
    this.el = document.getElementById('device-status');
    this.el.innerHTML = `
      <div class="widget-heading device-heading">
        <div>
          <div class="widget-kicker">DEVICE</div>
          <h2>System status</h2>
        </div>
        <div class="device-alert" role="status" aria-live="polite">
          <span class="status-dot"></span>
          <span class="status-label">Connecting</span>
        </div>
      </div>
      <div class="device-metrics">
        ${this.metricKeys.map((key) => `
          <div class="device-metric" data-metric="${key}">
            <div class="metric-topline">
              <span class="metric-name">${this.labelFor(key)}</span>
              <span class="metric-value">—</span>
            </div>
            <div class="metric-track"><span class="metric-fill"></span></div>
            <div class="metric-detail">Waiting for data</div>
          </div>
        `).join('')}
      </div>
      <div class="widget-updated device-updated">Local telemetry service</div>
    `;
    this.update();
  },

  labelFor(key) {
    return {
      cpu: 'CPU',
      gpu: 'GPU',
      memory: 'RAM',
      temperature: 'TEMP',
    }[key];
  },

  renderMetric(key, metric) {
    const item = this.el.querySelector(`[data-metric="${key}"]`);
    const available = metric && Number.isFinite(metric.value);
    const unit = metric?.unit || '';
    const displayValue = unit === '%'
      ? Math.floor(metric?.value)
      : Math.round(metric?.value);
    item.classList.toggle('is-unavailable', !available);
    item.querySelector('.metric-value').textContent = available
      ? `${displayValue}${unit}`
      : '—';
    item.querySelector('.metric-detail').textContent = metric?.detail || 'Unavailable';

    const scaled = available
      ? Math.max(0, Math.min(100, metric.value))
      : 0;
    item.querySelector('.metric-fill').style.width = `${scaled}%`;
  },

  setStatus(level, label) {
    ['healthy', 'warning', 'danger', 'critical', 'unknown'].forEach((state) => {
      this.el.classList.toggle(`device-status--${state}`, state === level);
    });
    this.el.querySelector('.status-label').textContent = label;
  },

  render(data) {
    this.setStatus(data.status.level, data.status.label);
    this.metricKeys.forEach((key) => this.renderMetric(key, data.metrics[key]));
    this.el.querySelector('.device-updated').textContent =
      `${data.hostname} · Updated ${new Date(data.updated_at).toLocaleTimeString([], {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      })}`;
  },

  async update() {
    try {
      const response = await fetch('/api/device', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Device API returned ${response.status}`);
      this.render(await response.json());
    } catch {
      this.setStatus('unknown', 'Offline');
      this.el.querySelector('.device-updated').textContent =
        'Start Panel with python3 serve.py to read device data';
    }
  },
};
