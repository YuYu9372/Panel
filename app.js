const widgets = [
  themeWidget,
  greetingWidget,
  clockWidget,
  weatherWidget,
  calendarWidget,
  tasksWidget,
  statusGridWidget,
  connectivityWidget,
  settingsWidget,
];

async function startWidgets() {
  let refreshMilliseconds = 15 * 60 * 1000;
  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    const config = await response.json();
    if (Number.isInteger(config.refresh_minutes)) {
      refreshMilliseconds = config.refresh_minutes * 60 * 1000;
    }
  } catch {}

  widgets.forEach((widget) => {
    if (widget.usesConfiguredRefresh) widget.interval = refreshMilliseconds;
    widget.init();
    if (widget.interval) setInterval(() => widget.update(), widget.interval);
  });
}

startWidgets();

setInterval(() => {
  widgets.forEach((widget) => widget.refreshUpdated && widget.refreshUpdated());
}, 30000);
