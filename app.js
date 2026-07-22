const widgets = [
  themeWidget,
  greetingWidget,
  clockWidget,
  weatherWidget,
  calendarWidget,
  tasksWidget,
  statusGridWidget,
  connectivityWidget,
  updateWidget,
  settingsWidget,
  versionWidget,
];

let configuredRefreshMinutes = 15;
let activeRefreshPolicy = DEFAULT_REFRESH_POLICY;
let configuredRefreshTimer = null;
let refreshScheduleGeneration = 0;

function configuredRefreshWidgets() {
  return widgets.filter((widget) => widget.usesConfiguredRefresh);
}

function scheduleConfiguredRefresh() {
  refreshScheduleGeneration += 1;
  const generation = refreshScheduleGeneration;
  if (configuredRefreshTimer) clearTimeout(configuredRefreshTimer);
  const delay = millisecondsUntilNextRefresh(
    new Date(),
    configuredRefreshMinutes,
    activeRefreshPolicy,
  );
  configuredRefreshTimer = setTimeout(async () => {
    if (generation !== refreshScheduleGeneration) return;
    await Promise.allSettled(configuredRefreshWidgets().map((widget) => widget.update(true)));
    if (generation === refreshScheduleGeneration) scheduleConfiguredRefresh();
  }, delay);
}

function applyLiveConfigPatch(patch) {
  const nextStatusConfig = patch && patch.statusColors
    ? validateStatusTierConfig(patch.statusColors)
    : getBundledStatusTierConfig();
  const nextRefreshPolicy = patch && patch.refreshPolicy
    ? validateRefreshPolicy(patch.refreshPolicy)
    : getBundledRefreshPolicy();
  applyStatusTierConfig(nextStatusConfig);
  activeRefreshPolicy = nextRefreshPolicy;
  scheduleConfiguredRefresh();
  if (statusGridWidget.el) statusGridWidget.update();
  if (connectivityWidget.el) connectivityWidget.update();
  return true;
}

async function startWidgets() {
  await Promise.all([
    loadStatusTierConfig(),
    loadRefreshPolicy(),
  ]);
  activeRefreshPolicy = getBundledRefreshPolicy();
  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    const config = await response.json();
    if (Number.isInteger(config.refresh_minutes)) {
      configuredRefreshMinutes = config.refresh_minutes;
    }
  } catch {}

  widgets.forEach((widget) => {
    widget.init();
    if (widget.interval && !widget.usesConfiguredRefresh) {
      setInterval(() => widget.update(), widget.interval);
    }
  });
  scheduleConfiguredRefresh();
}

startWidgets();

setInterval(() => {
  widgets.forEach((widget) => widget.refreshUpdated && widget.refreshUpdated());
}, 30000);
