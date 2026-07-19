const widgets = [
  greetingWidget,
  clockWidget,
  chatWidget,
  weatherWidget,
  deviceStatusWidget,
];

widgets.forEach((w) => {
  w.init();
  if (w.interval) setInterval(() => w.update(), w.interval);
});
