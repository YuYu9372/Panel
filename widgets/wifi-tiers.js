const wifiThresholds = Object.freeze([20, 30, 41]);

function wifiTierFor(value) {
  if (!Number.isFinite(value)) return 'gray';
  if (value < wifiThresholds[0]) return 'green';
  if (value < wifiThresholds[1]) return 'yellow';
  if (value < wifiThresholds[2]) return 'red';
  return 'purple';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { wifiThresholds, wifiTierFor };
}
