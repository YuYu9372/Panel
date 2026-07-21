const weatherWidget = {
  el: null,
  interval: 600000,
  lastUpdated: 0,

  lat: 25.03,
  lon: 121.56,
  city: 'Taipei',

  icons: {
    'clear-day': '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><g stroke="#f0a63b"><path d="M32 17.5V13M32 46.5V51M17.5 32H13M46.5 32H51M42.3 21.7l3.2-3.2M21.7 21.7l-3.2-3.2M21.7 42.3l-3.2 3.2M42.3 42.3l3.2 3.2"/><circle cx="32" cy="32" r="10" fill="#ffd06e"/></g></svg>',
    'clear-night': '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M49 31.6A18 18 0 1 1 29.4 12A14 14 0 0 0 49 31.6Z" fill="#ffd06e" stroke="#f0a63b"/><path d="M50 12v8M46 16h8M55 27v5M52.5 29.5h5" stroke="#f0a63b"/></svg>',
    'partly-cloudy': '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><g stroke="#f0a63b"><path d="M25 8.5V4M10.5 23H6M14.75 12.75L11.6 9.6M35.25 12.75L38.4 9.6M14.75 33.25L11.6 36.4"/><circle cx="25" cy="23" r="10" fill="#ffd06e"/></g><path d="M24 44A7.2 7.2 0 0 1 24.2 30A10 10 0 0 1 43.8 30A7.2 7.2 0 0 1 44 44Z" fill="#f7fbff" stroke="#5e6b87"/></svg>',
    'cloudy': '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M37 27A4.6 4.6 0 0 1 37.15 18A6.3 6.3 0 0 1 49.5 18A4.6 4.6 0 0 1 49.7 27Z" fill="#cfdcec" stroke="#5e6b87"/><path d="M19 42A7.2 7.2 0 0 1 19.2 28A10 10 0 0 1 38.8 28A7.2 7.2 0 0 1 39 42Z" fill="#f7fbff" stroke="#5e6b87"/></svg>',
    'fog': '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 34A7.2 7.2 0 0 1 22.2 20A10 10 0 0 1 41.8 20A7.2 7.2 0 0 1 42 34Z" fill="#f7fbff" stroke="#5e6b87"/><path d="M17 41H43M23 47H49M17 53H36" stroke="#5e6b87"/></svg>',
    'drizzle': '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 38A7.2 7.2 0 0 1 22.2 24A10 10 0 0 1 41.8 24A7.2 7.2 0 0 1 42 38Z" fill="#f7fbff" stroke="#5e6b87"/><path d="M24 44l-1 3.5M32 44l-1 3.5M40 44l-1 3.5M28 51l-1 3.5M36 51l-1 3.5" stroke="#4098d7"/></svg>',
    'rain': '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 38A7.2 7.2 0 0 1 22.2 24A10 10 0 0 1 41.8 24A7.2 7.2 0 0 1 42 38Z" fill="#f7fbff" stroke="#5e6b87"/><path d="M24 44l-2.5 8M33 44l-2.5 8M42 44l-2.5 8" stroke="#4098d7"/></svg>',
    'heavy-rain': '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 38A7.2 7.2 0 0 1 22.2 24A10 10 0 0 1 41.8 24A7.2 7.2 0 0 1 42 38Z" fill="#cfdcec" stroke="#5e6b87"/><path d="M21 44l-2.5 10M29 45l-2.5 10M37 44l-2.5 10M45 45l-2.5 10" stroke="#4098d7"/></svg>',
    'showers': '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><g stroke="#f0a63b"><path d="M25 7.5V3M10.5 22H6M14.75 11.75L11.6 8.6"/><circle cx="25" cy="22" r="10" fill="#ffd06e"/></g><path d="M24 40A7.2 7.2 0 0 1 24.2 26A10 10 0 0 1 43.8 26A7.2 7.2 0 0 1 44 40Z" fill="#f7fbff" stroke="#5e6b87"/><path d="M25 46l-2.5 8M34 46l-2.5 8M43 46l-2.5 8" stroke="#4098d7"/></svg>',
    'thunderstorm': '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 36A7.2 7.2 0 0 1 22.2 22A10 10 0 0 1 41.8 22A7.2 7.2 0 0 1 42 36Z" fill="#cfdcec" stroke="#5e6b87"/><path d="M35 37.5L27 48.5H32L29 57.5L38.5 46H33.5L38 37.5Z" fill="#ffd06e" stroke="#f0a63b"/><path d="M21.5 42l-2 6.5M42.5 42l-2 6.5" stroke="#4098d7"/></svg>',
  },

  codes: {
    0: ['clear-day', 'Clear'],
    1: ['clear-day', 'Mostly clear'],
    2: ['partly-cloudy', 'Partly cloudy'],
    3: ['cloudy', 'Cloudy'],
    45: ['fog', 'Fog'],
    48: ['fog', 'Fog'],
    51: ['drizzle', 'Drizzle'],
    53: ['drizzle', 'Drizzle'],
    55: ['drizzle', 'Drizzle'],
    61: ['rain', 'Rain'],
    63: ['rain', 'Rain'],
    65: ['heavy-rain', 'Heavy rain'],
    80: ['showers', 'Showers'],
    81: ['showers', 'Showers'],
    82: ['heavy-rain', 'Heavy showers'],
    95: ['thunderstorm', 'Thunderstorm'],
    96: ['thunderstorm', 'Thunderstorm'],
    99: ['thunderstorm', 'Thunderstorm'],
  },

  init() {
    this.el = document.getElementById('weather');
    this.el.innerHTML = `
      <div class="weather-city">${this.city}</div>
      <div class="weather-icon"></div>
      <div class="weather-temp"></div>
      <div class="weather-desc"></div>
      <div class="weather-meta">
        <span class="weather-range"></span>
        <span class="weather-uv"></span>
      </div>
      <div class="widget-updated"></div>
    `;
    this.update();
  },

  refreshUpdated() {
    if (!this.el) return;
    const el = this.el.querySelector('.widget-updated');
    if (el) el.textContent = this.lastUpdated ? `Updated ${timeAgo(this.lastUpdated)}` : '';
  },

  uvTier(uv) {
    if (uv >= 8) return 'extreme';
    if (uv >= 6) return 'high';
    if (uv >= 3) return 'moderate';
    return 'low';
  },

  async update() {
    try {
      const res = await fetch('/api/weather', { cache: 'no-store' });
      if (!res.ok) throw new Error(`weather ${res.status}`);
      const data = await res.json();

      const code = data.current.weather_code;
      let [icon, desc] = this.codes[code] || ['cloudy', 'Unknown'];

      const hour = new Date().getHours();
      if (icon === 'clear-day' && (hour < 6 || hour >= 18)) icon = 'clear-night';

      this.el.querySelector('.weather-icon').innerHTML = this.icons[icon];
      this.el.querySelector('.weather-temp').innerHTML =
        `${Math.round(data.current.temperature_2m)}<span class="weather-unit">°C</span>`;
      this.el.querySelector('.weather-desc').textContent = desc;
      this.el.querySelector('.weather-range').textContent =
        `${Math.round(data.daily.temperature_2m_min[0])}° / ${Math.round(data.daily.temperature_2m_max[0])}°`;

      const uv = Math.max(0, Math.round(data.current.uv_index ?? 0));
      this.el.querySelector('.weather-uv').textContent = `UV ${uv}`;
      this.el.classList.remove(
        'weather--low', 'weather--moderate', 'weather--high', 'weather--extreme',
      );
      this.el.classList.add(`weather--${this.uvTier(uv)}`);

      this.lastUpdated = Date.now();
      this.refreshUpdated();
    } catch {
      this.el.querySelector('.weather-desc').textContent = 'Weather unavailable';
    }
  },
};
