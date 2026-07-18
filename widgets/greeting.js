const greetingWidget = {
  el: null,
  interval: 60000,

  periods: [
    {
      from: 5, to: 12, title: 'Good Morning !',
      lines: ['Have a nice day.', 'Fresh start.', 'Time for breakfast?', 'Remember to drink water.'],
    },
    {
      from: 12, to: 18, title: 'Good Afternoon !',
      lines: ['Keep it up.', 'One thing at a time.', 'Stretch a little.', 'Remember to drink water.'],
    },
    {
      from: 18, to: 22, title: 'Good Evening !',
      lines: ['Time to slow down.', 'How was your day?', "You're doing fine.", 'Dinner time?'],
    },
    {
      from: 22, to: 5, title: 'Good Night !',
      lines: ['Time to sleep.', 'Rest your eyes.', 'Tomorrow can wait.', 'Sweet dreams.'],
    },
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

    const period = this.periods.find((p) =>
      p.from < p.to ? hour >= p.from && hour < p.to : hour >= p.from || hour < p.to
    );

    const line = period.lines[Math.floor(Math.random() * period.lines.length)];

    this.el.querySelector('.greeting-title').textContent = period.title;
    this.el.querySelector('.greeting-line').textContent = line;
  },
};
