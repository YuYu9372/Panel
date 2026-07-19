const themeWidget = {
  interval: 60000,

  init() {
    this.update();
  },

  update() {
    const hour = new Date().getHours();
    const dark = hour >= 18 || hour < 5;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  },
};
