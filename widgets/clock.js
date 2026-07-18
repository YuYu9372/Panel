const clockWidget = {
  el: null,
  interval: 1000,
  rot: null,

  init() {
    this.el = document.getElementById('clock');

    let ticks = '';
    for (let i = 0; i < 12; i++) {
      const major = i % 3 === 0 ? ' clock-tick-major' : '';
      ticks += `<div class="clock-tick${major}" style="transform: rotate(${i * 30}deg)"></div>`;
    }

    this.el.innerHTML = `
      <div class="clock-face">
        ${ticks}
        <div class="clock-hand clock-hour"></div>
        <div class="clock-hand clock-minute"></div>
        <div class="clock-hand clock-second"></div>
        <div class="clock-center"></div>
      </div>
      <div class="clock-time"></div>
      <div class="clock-date"></div>
    `;
    this.update();
  },

  update() {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const s = now.getSeconds();

    const raw = {
      hour: (h % 12) * 30 + m * 0.5,
      minute: m * 6 + s * 0.1,
      second: s * 6,
    };

    if (!this.rot) {
      this.rot = { ...raw };
    } else {
      for (const k in raw) {
        let delta = raw[k] - (((this.rot[k] % 360) + 360) % 360);
        if (delta < -180) delta += 360;
        this.rot[k] += delta;
      }
    }

    for (const k in this.rot) {
      this.el.querySelector(`.clock-${k}`).style.transform = `rotate(${this.rot[k]}deg)`;
    }

    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];

    const pad = (n) => String(n).padStart(2, '0');
    this.el.querySelector('.clock-time').textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
    this.el.querySelector('.clock-date').textContent =
      `${weekdays[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`;
  },
};
