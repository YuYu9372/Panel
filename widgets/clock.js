const clockWidget = {
  el: null,
  interval: 1000,

  init() {
    this.el = document.getElementById('clock');

    let ticks = '';
    for (let i = 0; i < 12; i++) {
      ticks += `<div class="clock-tick" style="transform: rotate(${i * 30}deg)"></div>`;
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

    this.el.querySelector('.clock-hour').style.transform =
      `rotate(${(h % 12) * 30 + m * 0.5}deg)`;
    this.el.querySelector('.clock-minute').style.transform =
      `rotate(${m * 6 + s * 0.1}deg)`;
    this.el.querySelector('.clock-second').style.transform =
      `rotate(${s * 6}deg)`;

    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];

    const pad = (n) => String(n).padStart(2, '0');
    this.el.querySelector('.clock-time').textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
    this.el.querySelector('.clock-date').textContent =
      `${weekdays[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`;
  },
};
