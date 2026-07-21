const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  DEFAULT_REFRESH_POLICY,
  isNightRefreshTime,
  loadRefreshPolicy,
  nextRefreshTime,
  refreshMinutesAt,
  validateRefreshPolicy,
} = require('../widgets/refresh-policy');

const configPath = path.join(__dirname, '..', 'config', 'refresh-policy.json');
const filePolicy = JSON.parse(fs.readFileSync(configPath, 'utf8'));

function localDate(hour, minute, second = 0) {
  return new Date(2026, 6, 22, hour, minute, second, 0);
}

test('refresh policy JSON matches the built-in safe policy', () => {
  assert.deepEqual(validateRefreshPolicy(filePolicy), DEFAULT_REFRESH_POLICY);
});

test('night refresh uses thirty minutes from midnight until six', () => {
  assert.equal(isNightRefreshTime(localDate(23, 59), filePolicy), false);
  assert.equal(isNightRefreshTime(localDate(0, 0), filePolicy), true);
  assert.equal(isNightRefreshTime(localDate(5, 59), filePolicy), true);
  assert.equal(isNightRefreshTime(localDate(6, 0), filePolicy), false);
  assert.equal(refreshMinutesAt(localDate(2, 15), 15, filePolicy), 30);
  assert.equal(refreshMinutesAt(localDate(12, 15), 15, filePolicy), 15);
});

test('next refresh aligns to half hours and day-night boundaries', () => {
  assert.equal(
    nextRefreshTime(localDate(23, 59), 15, filePolicy).getTime(),
    new Date(2026, 6, 23, 0, 0, 0, 0).getTime(),
  );
  assert.equal(nextRefreshTime(localDate(0, 0), 15, filePolicy).getTime(), localDate(0, 30).getTime());
  assert.equal(nextRefreshTime(localDate(0, 7), 15, filePolicy).getTime(), localDate(0, 30).getTime());
  assert.equal(nextRefreshTime(localDate(5, 59), 15, filePolicy).getTime(), localDate(6, 0).getTime());
  assert.equal(nextRefreshTime(localDate(6, 0), 15, filePolicy).getTime(), localDate(6, 15).getTime());
});

test('unsafe or ambiguous refresh policies are rejected', () => {
  const remoteTimezone = structuredClone(filePolicy);
  remoteTimezone.timezone = 'UTC';
  assert.throws(() => validateRefreshPolicy(remoteTimezone), /timezone/);
  const disabledManualRefresh = structuredClone(filePolicy);
  disabledManualRefresh.manualRefresh = false;
  assert.throws(() => validateRefreshPolicy(disabledManualRefresh), /Manual refresh/);
  const invalidTime = structuredClone(filePolicy);
  invalidTime.night.start = '24:00';
  assert.throws(() => validateRefreshPolicy(invalidTime), /HH:MM/);
});

test('failed policy loading keeps the safe built-in policy', async () => {
  const loaded = await loadRefreshPolicy(async () => ({ ok: false, status: 500 }));
  assert.equal(loaded, DEFAULT_REFRESH_POLICY);
});
