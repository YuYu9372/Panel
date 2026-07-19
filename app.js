const widgets = [
  themeWidget,
  greetingWidget,
  clockWidget,
  weatherWidget,
  calendarWidget,
  tasksWidget,
  deviceStatusWidget,
];

widgets.forEach((w) => {
  w.init();
  if (w.interval) setInterval(() => w.update(), w.interval);
});
