const greetingWidget = {
  el: null,
  interval: 60000,

  periods: [
    {
      from: 5,
      to: 12,
      title: 'Good Morning !',
      lines: ['Fresh start.', 'Time for breakfast?'],
    },
    {
      from: 12,
      to: 18,
      title: 'Good Afternoon !',
      lines: ['Keep it up.', 'Stretch a little.'],
    },
    {
      from: 18,
      to: 22,
      title: 'Good Evening !',
      lines: ['How was your day?', 'Dinner time?'],
    },
    {
      from: 22,
      to: 5,
      title: 'Good Night !',
      lines: ['Time to sleep.', 'Sweet dreams.'],
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
    const period = this.periods.find((item) => (
      item.from < item.to
        ? hour >= item.from && hour < item.to
        : hour >= item.from || hour < item.to
    ));
    const minute = new Date().getMinutes();

    this.el.querySelector('.greeting-title').textContent = period.title;
    this.el.querySelector('.greeting-line').textContent =
      period.lines[minute % period.lines.length];
  },
};
