const widgets = [
  greetingWidget,
  clockWidget,
  githubContributionsWidget,
  weatherWidget,
  deviceStatusWidget,
];

widgets.forEach((w) => {
  w.init();
  if (w.interval) setInterval(() => w.update(), w.interval);
});
