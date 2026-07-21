const STATUS_METRICS = Object.freeze(['cpu', 'gpu', 'ram', 'temp', 'wifi']);
const STATUS_COLORS = Object.freeze(['green', 'yellow', 'red', 'purple', 'gray']);

const DEFAULT_STATUS_TIER_CONFIG = Object.freeze({
  schemaVersion: 1,
  metrics: Object.freeze({
    cpu: Object.freeze({ unit: '%', rules: Object.freeze([
      Object.freeze({ minInclusive: 0, maxExclusive: 60, color: 'green' }),
      Object.freeze({ minInclusive: 60, maxExclusive: 80, color: 'yellow' }),
      Object.freeze({ minInclusive: 80, maxExclusive: 94, color: 'red' }),
      Object.freeze({ minInclusive: 94, maxExclusive: null, color: 'purple' }),
    ]) }),
    gpu: Object.freeze({ unit: '%', rules: Object.freeze([
      Object.freeze({ minInclusive: 0, maxExclusive: 60, color: 'green' }),
      Object.freeze({ minInclusive: 60, maxExclusive: 80, color: 'yellow' }),
      Object.freeze({ minInclusive: 80, maxExclusive: 94, color: 'red' }),
      Object.freeze({ minInclusive: 94, maxExclusive: null, color: 'purple' }),
    ]) }),
    ram: Object.freeze({ unit: '%', rules: Object.freeze([
      Object.freeze({ minInclusive: 0, maxExclusive: 40, color: 'green' }),
      Object.freeze({ minInclusive: 40, maxExclusive: 70, color: 'yellow' }),
      Object.freeze({ minInclusive: 70, maxExclusive: 86, color: 'red' }),
      Object.freeze({ minInclusive: 86, maxExclusive: null, color: 'purple' }),
    ]) }),
    temp: Object.freeze({ unit: '°C', rules: Object.freeze([
      Object.freeze({ minInclusive: 0, maxExclusive: 60, color: 'green' }),
      Object.freeze({ minInclusive: 60, maxExclusive: 80, color: 'yellow' }),
      Object.freeze({ minInclusive: 80, maxExclusive: 91, color: 'red' }),
      Object.freeze({ minInclusive: 91, maxExclusive: null, color: 'purple' }),
    ]) }),
    wifi: Object.freeze({ unit: 'ms', rules: Object.freeze([
      Object.freeze({ minInclusive: 0, maxExclusive: 20, color: 'green' }),
      Object.freeze({ minInclusive: 20, maxExclusive: 30, color: 'yellow' }),
      Object.freeze({ minInclusive: 30, maxExclusive: 41, color: 'red' }),
      Object.freeze({ minInclusive: 41, maxExclusive: null, color: 'purple' }),
    ]) }),
  }),
  offline: Object.freeze({ color: 'red', showSlash: true }),
  unavailable: Object.freeze({ color: 'gray' }),
});

let statusTierConfig = DEFAULT_STATUS_TIER_CONFIG;

function ensureObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function ensureKeys(value, keys, label) {
  ensureObject(value, label);
  const expected = new Set(keys);
  if (Object.keys(value).some((key) => !expected.has(key))) {
    throw new Error(`${label} contains an unsupported field.`);
  }
  if (keys.some((key) => !(key in value))) {
    throw new Error(`${label} is missing a required field.`);
  }
}

function validateRules(rules, label) {
  if (!Array.isArray(rules) || rules.length < 1 || rules.length > 8) {
    throw new Error(`${label} must contain 1 to 8 rules.`);
  }
  let previousMaximum = 0;
  return rules.map((rule, index) => {
    ensureKeys(rule, ['minInclusive', 'maxExclusive', 'color'], `${label} rule`);
    if (!Number.isFinite(rule.minInclusive) || rule.minInclusive < 0) {
      throw new Error(`${label} has an invalid minimum.`);
    }
    if (rule.minInclusive !== previousMaximum) {
      throw new Error(`${label} rules must be continuous and ordered.`);
    }
    const last = index === rules.length - 1;
    if (last && rule.maxExclusive !== null) {
      throw new Error(`${label} final rule must have a null maximum.`);
    }
    if (!last && (!Number.isFinite(rule.maxExclusive) || rule.maxExclusive <= rule.minInclusive)) {
      throw new Error(`${label} has an invalid maximum.`);
    }
    if (!STATUS_COLORS.includes(rule.color)) {
      throw new Error(`${label} uses an unsupported color.`);
    }
    previousMaximum = rule.maxExclusive;
    return {
      minInclusive: rule.minInclusive,
      maxExclusive: rule.maxExclusive,
      color: rule.color,
    };
  });
}

function validateStatusTierConfig(value) {
  ensureKeys(value, ['schemaVersion', 'metrics', 'offline', 'unavailable'], 'Status color config');
  if (value.schemaVersion !== 1) throw new Error('Unsupported status color schema.');
  ensureKeys(value.metrics, STATUS_METRICS, 'Status metrics');
  const metrics = {};
  for (const metric of STATUS_METRICS) {
    const source = value.metrics[metric];
    ensureKeys(source, ['unit', 'rules'], `${metric} config`);
    if (typeof source.unit !== 'string' || !source.unit || source.unit.length > 8) {
      throw new Error(`${metric} has an invalid unit.`);
    }
    metrics[metric] = {
      unit: source.unit,
      rules: validateRules(source.rules, metric),
    };
  }
  ensureKeys(value.offline, ['color', 'showSlash'], 'Offline config');
  ensureKeys(value.unavailable, ['color'], 'Unavailable config');
  if (!STATUS_COLORS.includes(value.offline.color)
      || !STATUS_COLORS.includes(value.unavailable.color)
      || typeof value.offline.showSlash !== 'boolean') {
    throw new Error('Status fallback colors are invalid.');
  }
  return {
    schemaVersion: 1,
    metrics,
    offline: { color: value.offline.color, showSlash: value.offline.showSlash },
    unavailable: { color: value.unavailable.color },
  };
}

async function loadStatusTierConfig(fetcher = fetch) {
  try {
    const response = await fetcher('/config/status-colors.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Status color config returned ${response.status}.`);
    statusTierConfig = validateStatusTierConfig(await response.json());
  } catch {
    statusTierConfig = DEFAULT_STATUS_TIER_CONFIG;
  }
  return statusTierConfig;
}

function statusTierFor(metric, value, config = statusTierConfig) {
  if (!Number.isFinite(value) || !config.metrics[metric]) return config.unavailable.color;
  const rule = config.metrics[metric].rules.find((candidate) => (
    value >= candidate.minInclusive
    && (candidate.maxExclusive === null || value < candidate.maxExclusive)
  ));
  return rule ? rule.color : config.unavailable.color;
}

function statusOfflineStyle() {
  return statusTierConfig.offline;
}

function statusUnavailableColor() {
  return statusTierConfig.unavailable.color;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_STATUS_TIER_CONFIG,
    STATUS_METRICS,
    loadStatusTierConfig,
    statusTierFor,
    validateStatusTierConfig,
  };
}
