const greetingWidget = {
  el: null,
  interval: 60000,

  lines: [
    'Have a nice day.',
    'One thing at a time.',
    'Remember to drink water.',
    'Stretch a little.',
    "You're doing fine.",
  ],

  init() {
    this.el = document.getElementById('greeting');
    this.el.innerHTML = `
      <span class="greeting-title"></span>
      <span class="greeting-line"></span>
    `;
    this.update();
  },

  update() {
    const hour = new Date().getHours();

    let title;
    if (hour < 5) title = 'Good Night !';
    else if (hour < 12) title = 'Good Morning !';
    else if (hour < 18) title = 'Good Afternoon !';
    else title = 'Good Evening !';

    const line = this.lines[Math.floor(Math.random() * this.lines.length)];

    this.el.querySelector('.greeting-title').textContent = title;
    this.el.querySelector('.greeting-line').textContent = line;
  },
};
