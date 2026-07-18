const weatherWidget = {
  el: null,
  interval: 600000,

  lat: 25.03,
  lon: 121.56,

  codes: {
    0: ['☀️', 'Clear'],
    1: ['🌤️', 'Mostly clear'],
    2: ['⛅', 'Partly cloudy'],
    3: ['☁️', 'Cloudy'],
    45: ['🌫️', 'Fog'],
    48: ['🌫️', 'Fog'],
    51: ['🌦️', 'Drizzle'],
    53: ['🌦️', 'Drizzle'],
    55: ['🌦️', 'Drizzle'],
    61: ['🌧️', 'Rain'],
    63: ['🌧️', 'Rain'],
    65: ['🌧️', 'Heavy rain'],
    80: ['🌧️', 'Showers'],
    81: ['🌧️', 'Showers'],
    82: ['🌧️', 'Heavy showers'],
    95: ['⛈️', 'Thunderstorm'],
    96: ['⛈️', 'Thunderstorm'],
    99: ['⛈️', 'Thunderstorm'],
  },

  init() {
    this.el = document.getElementById('weather');
    this.el.innerHTML = `
      <div class="weather-icon"></div>
      <div class="weather-temp"></div>
      <div class="weather-desc"></div>
      <div class="weather-range"></div>
    `;
    this.update();
  },

  async update() {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${this.lat}&longitude=${this.lon}` +
      `&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;

    try {
      const res = await fetch(url);
      const data = await res.json();

      const [icon, desc] = this.codes[data.current.weather_code] || ['❓', 'Unknown'];

      this.el.querySelector('.weather-icon').textContent = icon;
      this.el.querySelector('.weather-temp').textContent =
        `${Math.round(data.current.temperature_2m)}°C`;
      this.el.querySelector('.weather-desc').textContent = desc;
      this.el.querySelector('.weather-range').textContent =
        `${Math.round(data.daily.temperature_2m_min[0])}° / ${Math.round(data.daily.temperature_2m_max[0])}°`;
    } catch {
      this.el.querySelector('.weather-desc').textContent = 'Weather unavailable';
    }
  },
};
