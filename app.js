const widgets = [
  themeWidget,
  greetingWidget,
  clockWidget,
  weatherWidget,
  calendarWidget,
  tasksWidget,
  statusGridWidget,
  connectivityWidget,
];

widgets.forEach((w) => {
  w.init();
  if (w.interval) setInterval(() => w.update(), w.interval);
});

setInterval(() => {
  widgets.forEach((w) => w.refreshUpdated && w.refreshUpdated());
}, 30000);
