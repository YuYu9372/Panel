const connectivityWidget = {
  el: null,
  overlay: null,
  clockEl: null,
  interval: 5000,
  failStreak: 0,
  offlineAfter: 2,

  init() {
    this.el = document.getElementById('connectivity');
    this.overlay = document.getElementById('offline-screen');
    this.clockEl = document.getElementById('offline-clock');
    this.tickClock();
    this.el.innerHTML = `
      <svg class="net-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none"
           stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2.5 8.5a15 15 0 0 1 19 0" />
        <path d="M5.5 12a10.5 10.5 0 0 1 13 0" />
        <path d="M8.5 15.5a6 6 0 0 1 7 0" />
        <circle cx="12" cy="19" r="1.1" fill="currentColor" stroke="none" />
        <line class="net-slash" x1="3.5" y1="20.5" x2="20.5" y2="3.5" />
      </svg>
      <span class="net-latency"></span>
    `;
    this.setState('unknown', null);
    this.update();
  },

  setState(state, latency) {
    const offline = statusOfflineStyle();
    const visualState = state === 'down'
      ? offline.color
      : state === 'unknown' ? statusUnavailableColor() : state;
    this.el.classList.remove('net--unknown');
    ['green', 'yellow', 'red', 'purple', 'gray'].forEach((color) =>
      this.el.classList.toggle(`net--${color}`, color === visualState));
    this.el.classList.toggle('net--down', state === 'down');
    this.el.classList.toggle('net--slash', state === 'down' && offline.showSlash);
    this.el.querySelector('.net-latency').textContent =
      latency == null ? '' : `${Math.round(latency)} ms`;
    this.el.setAttribute('aria-label',
      state === 'down' ? 'Network offline'
        : latency == null ? 'Network status unknown'
          : `Network online, ${Math.round(latency)} ms`);
  },

  showOffline(show) {
    if (this.overlay) this.overlay.hidden = !show;
  },

  tickClock() {
    if (this.clockEl) {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      this.clockEl.textContent =
        `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    }
    setTimeout(() => this.tickClock(), 1000 - (Date.now() % 1000));
  },

  async update() {
    try {
      const res = await fetch('/api/net', { cache: 'no-store' });
      if (!res.ok) throw new Error(`net ${res.status}`);
      const data = await res.json();
      if (!data.online) throw new Error('offline');
      this.failStreak = 0;
      const tier = statusTierFor('wifi', data.latency_ms);
      this.setState(tier === 'gray' ? 'unknown' : tier, data.latency_ms);
      this.showOffline(false);
    } catch {
      this.failStreak += 1;
      this.setState('down', null);
      if (this.failStreak >= this.offlineAfter) this.showOffline(true);
    }
  },
};
