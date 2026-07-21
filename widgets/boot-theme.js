const bootThemeHour = new Date().getHours();
document.documentElement.dataset.theme = bootThemeHour >= 18 || bootThemeHour < 5
  ? 'dark'
  : 'light';
