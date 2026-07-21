const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  DEFAULT_STATUS_TIER_CONFIG,
  STATUS_METRICS,
  loadStatusTierConfig,
  statusTierFor,
  validateStatusTierConfig,
} = require('../widgets/status-tiers');

const configPath = path.join(__dirname, '..', 'config', 'status-colors.json');
const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

test('status color JSON contains every metric and matches the safe fallback', () => {
  const validated = validateStatusTierConfig(fileConfig);
  assert.deepEqual(Object.keys(validated.metrics), STATUS_METRICS);
  assert.deepEqual(validated, DEFAULT_STATUS_TIER_CONFIG);
});

test('all metric boundaries have no gaps or overlaps', () => {
  const cases = {
    cpu: [[79.99, 'green'], [80, 'yellow'], [90, 'red'], [94, 'purple']],
    gpu: [[79.99, 'green'], [80, 'yellow'], [90, 'red'], [96, 'purple']],
    ram: [[69.99, 'green'], [70, 'yellow'], [80, 'red'], [90, 'purple']],
    temp: [[69.99, 'green'], [70, 'yellow'], [80, 'red'], [95, 'purple']],
    wifi: [[24.99, 'green'], [25, 'yellow'], [35, 'red'], [45, 'purple']],
  };
  for (const [metric, values] of Object.entries(cases)) {
    for (const [value, color] of values) {
      assert.equal(statusTierFor(metric, value, fileConfig), color);
    }
  }
});

test('invalid, overlapping, and incomplete configurations are rejected', () => {
  const invalid = structuredClone(fileConfig);
  invalid.metrics.cpu.rules[1].minInclusive = 59;
  assert.throws(() => validateStatusTierConfig(invalid), /continuous and ordered/);
  const incomplete = structuredClone(fileConfig);
  delete incomplete.metrics.gpu;
  assert.throws(() => validateStatusTierConfig(incomplete), /missing a required field/);
  const scripted = structuredClone(fileConfig);
  scripted.metrics.wifi.rules[0].script = 'run()';
  assert.throws(() => validateStatusTierConfig(scripted), /unsupported field/);
});

test('failed JSON loading keeps the built-in safe configuration', async () => {
  const loaded = await loadStatusTierConfig(async () => ({ ok: false, status: 500 }));
  assert.equal(loaded, DEFAULT_STATUS_TIER_CONFIG);
  assert.equal(statusTierFor('wifi', null), 'gray');
});
