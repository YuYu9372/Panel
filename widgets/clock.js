const clockWidget = {
  el: null,
  interval: 1000,

  init() {
    this.el = document.getElementById('clock');
    this.el.innerHTML = `
      <div class="clock-time"></div>
      <div class="clock-date"></div>
    `;
    this.update();
  },

  update() {
    const now = new Date();

    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');

    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];

    this.el.querySelector('.clock-time').textContent = `${hh}:${mm}:${ss}`;
    this.el.querySelector('.clock-date').textContent =
      `${weekdays[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`;
  },
};
